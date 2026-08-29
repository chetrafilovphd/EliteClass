// "Моят час" — the teacher's single working screen (shkolo-inspired, adapted):
// pick a date -> pick one of your scheduled slots -> set topic + homework ->
// enter a percentage result and/or a praise/remark sticker per student ->
// save everything at once. No attendance (by design).
import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const teacherNameEl = document.getElementById('teacher-name');
const dateInput = document.getElementById('lesson-date');
const slotSelect = document.getElementById('slot-select');
const slotHintEl = document.getElementById('slot-hint');
const lessonSection = document.getElementById('lesson-section');
const emptyState = document.getElementById('empty-state');
const topicInput = document.getElementById('lesson-topic');
const homeworkTitleInput = document.getElementById('homework-title');
const homeworkDueInput = document.getElementById('homework-due');
const bulkTypeSelect = document.getElementById('bulk-type');
const bulkPercentInput = document.getElementById('bulk-percent');
const bulkApplyBtn = document.getElementById('bulk-apply');
const studentsListEl = document.getElementById('students-list');
const saveAllBtn = document.getElementById('save-all-btn');

const GRADE_TYPES = ['Писане', 'Тест', 'Диктовка', 'Говорене', 'Граматика', 'Четене', 'Слушане'];

let currentUser = null;
let currentRole = null;
let slots = [];
let students = [];               // [{ student_id, full_name }]
let recentByStudent = new Map(); // student_id -> [{ percentage, title }]
let absenceCountByStudent = new Map(); // student_id -> accumulated absence count
const remarkState = new Map();   // student_id -> 'praise' | 'remark' | null
const absentState = new Map();   // student_id -> true if marked absent for this session

function showMessage(text, ok = false) {
  if (!msgEl) return;
  msgEl.textContent = text || '';
  msgEl.className = `msg small mb-3 ${ok ? 'text-success' : 'text-danger'}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function todayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function isoWeekday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const wd = d.getDay();
  return wd === 0 ? 7 : wd; // 1 = Monday ... 7 = Sunday
}

function hhmm(t) { return String(t || '').slice(0, 5); }

function percentBadge(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return '';
  let band = 2;
  if (n >= 95) band = 6; else if (n >= 85) band = 5; else if (n >= 70) band = 4; else if (n >= 50) band = 3;
  return `<span class="elite-grade elite-grade-${band}">${Math.round(n)}%</span>`;
}

function typeOptions(selected) {
  return GRADE_TYPES
    .map((t) => `<option value="${escapeHtml(t)}"${t === selected ? ' selected' : ''}>${escapeHtml(t)}</option>`)
    .join('');
}

async function requireTeacher() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) { window.location.href = 'login.html'; return false; }
  currentUser = session.user;

  const { data: profile, error } = await supabase
    .from('profiles').select('role, full_name').eq('id', currentUser.id).single();
  if (error) { showMessage(`Грешка при профил: ${error.message}`); return false; }

  currentRole = profile.role;
  if (currentRole !== 'teacher' && currentRole !== 'admin') {
    showMessage('Тази страница е за учители.');
    return false;
  }
  teacherNameEl.textContent = profile.full_name || currentUser.email;
  return true;
}

// The teacher's scheduled slots for the weekday of the chosen date.
async function loadSlotsForDate() {
  const dateStr = dateInput.value || todayIso();
  const wd = isoWeekday(dateStr);

  // Teacher sees only their own groups' slots (groups fetched first — avoids the
  // embedded-filter that returned empty); admin sees all groups' slots.
  let groupIds = null;
  if (currentRole === 'teacher') {
    const { data: myGroups } = await supabase.from('groups').select('id').eq('teacher_id', currentUser.id);
    groupIds = (myGroups || []).map((g) => g.id);
  }

  if (groupIds && groupIds.length === 0) {
    slots = [];
  } else {
    let q = supabase
      .from('schedule_slots')
      .select('id, group_id, day_of_week, start_time, end_time, room, groups(name)')
      .eq('day_of_week', wd)
      .order('start_time');
    if (groupIds) q = q.in('group_id', groupIds);

    const { data, error } = await q;
    if (error) {
      showMessage(`Грешка при разписанието: ${error.message}`);
      slots = [];
    } else {
      slots = data || [];
    }
  }

  if (slots.length === 0) {
    slotSelect.innerHTML = '<option value="">Няма часове за този ден</option>';
    slotHintEl.textContent = 'В този ден нямаш часове по разписание. Разписанието се прави от администратора.';
    lessonSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  slotHintEl.textContent = 'Часовете идват от седмичното разписание, направено от администратора.';
  slotSelect.innerHTML = '<option value="">Избери час…</option>' + slots
    .map((s, i) => `<option value="${i}">Час ${i + 1} / ${hhmm(s.start_time)}–${hhmm(s.end_time)} — ${escapeHtml(s.groups?.name || '')}${s.room ? ` (зала ${escapeHtml(s.room)})` : ''}</option>`)
    .join('');
}

async function loadLessonScreen() {
  const idx = slotSelect.value;
  if (idx === '') {
    lessonSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  const slot = slots[Number(idx)];
  if (!slot) return;

  const groupId = slot.group_id;
  const dateStr = dateInput.value || todayIso();

  showMessage('Зареждаме...');
  remarkState.clear();
  absentState.clear();

  const { data: lesson } = await supabase
    .from('lessons').select('id, topic').eq('group_id', groupId).eq('lesson_date', dateStr).maybeSingle();
  topicInput.value = lesson?.topic || '';

  const { data: enrolled, error: enrErr } = await supabase
    .from('group_students').select('student_id').eq('group_id', groupId);
  if (enrErr) { showMessage(`Грешка при учениците: ${enrErr.message}`); return; }

  const ids = [...new Set((enrolled || []).map((r) => r.student_id).filter(Boolean))];
  students = [];
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    const nameById = new Map((profs || []).map((p) => [p.id, p.full_name]));
    students = ids
      .map((id) => ({ student_id: id, full_name: nameById.get(id) || `#${String(id).slice(0, 8)}` }))
      .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'bg'));
  }

  recentByStudent = new Map();
  const { data: grades } = await supabase
    .from('grades').select('student_id, percentage, title, graded_on')
    .eq('group_id', groupId).order('graded_on', { ascending: false }).limit(200);
  (grades || []).forEach((g) => {
    const list = recentByStudent.get(g.student_id) || [];
    if (list.length < 4) list.push(g);
    recentByStudent.set(g.student_id, list);
  });

  // Accumulated absences per student (for the running statistic).
  absenceCountByStudent = new Map();
  const { data: absences } = await supabase
    .from('attendance')
    .select('student_id, lessons!inner(group_id)')
    .eq('lessons.group_id', groupId)
    .eq('status', 'absent');
  (absences || []).forEach((a) => {
    absenceCountByStudent.set(a.student_id, (absenceCountByStudent.get(a.student_id) || 0) + 1);
  });

  renderStudents();
  lessonSection.classList.remove('hidden');
  emptyState.classList.add('hidden');
  showMessage('');
}

function renderStudents() {
  if (students.length === 0) {
    studentsListEl.innerHTML = '<div class="elite-empty py-3"><i class="bi bi-inbox"></i>В тази група още няма записани ученици. Администраторът ги записва.</div>';
    return;
  }

  studentsListEl.innerHTML = students.map((s) => {
    const recent = (recentByStudent.get(s.student_id) || [])
      .map((g) => `<span title="${escapeHtml(g.title || '')}">${percentBadge(g.percentage)}</span>`).join(' ');
    const sid = escapeHtml(s.student_id);
    const absCount = absenceCountByStudent.get(s.student_id) || 0;
    const absChip = absCount
      ? `<span class="badge text-bg-secondary" title="Натрупани отсъствия"><i class="bi bi-calendar-x me-1"></i>${absCount}</span>`
      : '';
    return `
      <div class="card border mb-2">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">
            <div class="fw-semibold"><i class="bi bi-person-circle me-1 text-secondary"></i>${escapeHtml(s.full_name)}</div>
            <div class="d-flex align-items-center gap-2">
              ${absChip}
              <button class="btn btn-sm btn-outline-danger js-absent" data-id="${sid}" type="button"><i class="bi bi-calendar-x me-1"></i>Отсъства</button>
            </div>
          </div>
          <div class="mb-2 d-flex flex-wrap gap-1">${recent || '<span class="elite-muted small">няма резултати</span>'}</div>
          <div class="row g-2 align-items-end">
            <div class="col-5 col-md-3">
              <label class="form-label small mb-1">Резултат %</label>
              <input class="form-control js-pct" data-id="${sid}" type="number" min="0" max="100" placeholder="—" />
            </div>
            <div class="col-7 col-md-4">
              <label class="form-label small mb-1">Тип</label>
              <select class="form-select js-type" data-id="${sid}">${typeOptions('Тест')}</select>
            </div>
            <div class="col-12 col-md-5">
              <label class="form-label small mb-1">Отзив</label>
              <div class="d-flex gap-1">
                <button class="btn btn-sm btn-outline-success flex-fill js-praise" data-id="${sid}" type="button"><i class="bi bi-emoji-smile me-1"></i>Похвала</button>
                <button class="btn btn-sm btn-outline-warning flex-fill js-remark" data-id="${sid}" type="button"><i class="bi bi-exclamation-triangle me-1"></i>Забележка</button>
              </div>
            </div>
            <div class="col-12 js-note-wrap hidden" data-id="${sid}">
              <input class="form-control form-control-sm js-note" data-id="${sid}" placeholder="Текст на отзива…" />
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  studentsListEl.querySelectorAll('.js-praise').forEach((b) => b.addEventListener('click', () => toggleRemark(b.dataset.id, 'praise')));
  studentsListEl.querySelectorAll('.js-remark').forEach((b) => b.addEventListener('click', () => toggleRemark(b.dataset.id, 'remark')));
  studentsListEl.querySelectorAll('.js-absent').forEach((b) => b.addEventListener('click', () => toggleAbsent(b.dataset.id)));
}

function toggleAbsent(sid) {
  const next = !absentState.get(sid);
  absentState.set(sid, next);
  const btn = studentsListEl.querySelector(`.js-absent[data-id="${CSS.escape(sid)}"]`);
  btn?.classList.toggle('btn-danger', next);
  btn?.classList.toggle('btn-outline-danger', !next);
  if (btn) btn.innerHTML = `<i class="bi bi-calendar-x me-1"></i>Отсъства${next ? ' ✓' : ''}`;
}

function toggleRemark(sid, kind) {
  const next = remarkState.get(sid) === kind ? null : kind;
  remarkState.set(sid, next);

  const q = (cls) => studentsListEl.querySelector(`${cls}[data-id="${CSS.escape(sid)}"]`);
  const praiseBtn = q('.js-praise');
  const remarkBtn = q('.js-remark');
  const noteWrap = q('.js-note-wrap');

  praiseBtn?.classList.toggle('btn-success', next === 'praise');
  praiseBtn?.classList.toggle('btn-outline-success', next !== 'praise');
  remarkBtn?.classList.toggle('btn-warning', next === 'remark');
  remarkBtn?.classList.toggle('btn-outline-warning', next !== 'remark');
  noteWrap?.classList.toggle('hidden', !next);
}

bulkApplyBtn?.addEventListener('click', () => {
  const pct = bulkPercentInput.value;
  const type = bulkTypeSelect.value;
  if (pct === '') { showMessage('Въведи резултат % за всички.'); return; }
  studentsListEl.querySelectorAll('.js-pct').forEach((el) => { el.value = pct; });
  studentsListEl.querySelectorAll('.js-type').forEach((el) => { el.value = type; });
  showMessage('Приложено на всички. Не забравяй „Запази промените“.', true);
});

saveAllBtn?.addEventListener('click', async () => {
  const idx = slotSelect.value;
  if (idx === '') { showMessage('Избери час.'); return; }
  const slot = slots[Number(idx)];
  const groupId = slot.group_id;
  const dateStr = dateInput.value || todayIso();

  saveAllBtn.disabled = true;
  showMessage('Записваме...');

  try {
    // 1) Lesson — one per group per date; also needed to attach absences.
    const topic = topicInput.value.trim();
    const anyAbsent = [...absentState.values()].some(Boolean);
    let lessonId = null;
    if (topic || anyAbsent) {
      const { data: existing } = await supabase
        .from('lessons').select('id').eq('group_id', groupId).eq('lesson_date', dateStr).maybeSingle();
      if (existing?.id) {
        lessonId = existing.id;
        if (topic) {
          const { error } = await supabase.from('lessons').update({ topic }).eq('id', lessonId);
          if (error) throw new Error(`тема: ${error.message}`);
        }
      } else {
        const { data: created, error } = await supabase.from('lessons')
          .insert({ group_id: groupId, lesson_date: dateStr, topic: topic || 'Час', created_by: currentUser.id })
          .select('id').single();
        if (error) throw new Error(`тема: ${error.message}`);
        lessonId = created.id;
      }
    }

    // 2) Homework
    const hwTitle = homeworkTitleInput.value.trim();
    if (hwTitle) {
      const { error } = await supabase.from('homeworks').insert({
        group_id: groupId,
        title: hwTitle,
        due_date: homeworkDueInput.value || null,
        created_by: currentUser.id,
      });
      if (error) throw new Error(`домашно: ${error.message}`);
    }

    // 3) Results (percentage + type)
    const gradeRows = [];
    studentsListEl.querySelectorAll('.js-pct').forEach((el) => {
      if (el.value === '') return;
      const n = Number(el.value);
      if (!Number.isFinite(n) || n < 0 || n > 100) return;
      const sid = el.dataset.id;
      const type = studentsListEl.querySelector(`.js-type[data-id="${CSS.escape(sid)}"]`)?.value || 'Тест';
      gradeRows.push({
        group_id: groupId, student_id: sid, percentage: n, title: type,
        graded_on: dateStr, created_by: currentUser.id,
      });
    });
    if (gradeRows.length) {
      const { error } = await supabase.from('grades').insert(gradeRows);
      if (error) throw new Error(`резултати: ${error.message}`);
    }

    // 4) Praise / remarks
    const remarkRows = [];
    remarkState.forEach((kind, sid) => {
      if (!kind) return;
      const note = studentsListEl.querySelector(`.js-note[data-id="${CSS.escape(sid)}"]`)?.value.trim();
      remarkRows.push({
        group_id: groupId, student_id: sid, type: kind,
        note: note || (kind === 'praise' ? 'Похвала' : 'Забележка'),
        created_by: currentUser.id,
      });
    });
    if (remarkRows.length) {
      const { error } = await supabase.from('remarks').insert(remarkRows);
      if (error) throw new Error(`отзиви: ${error.message}`);
    }

    // 5) Attendance — record absences so they accumulate as a statistic.
    let absentCount = 0;
    if (lessonId) {
      const attRows = [];
      absentState.forEach((isAbsent, sid) => {
        if (isAbsent) attRows.push({ lesson_id: lessonId, student_id: sid, status: 'absent' });
      });
      if (attRows.length) {
        const { error } = await supabase.from('attendance').upsert(attRows, { onConflict: 'lesson_id,student_id' });
        if (error) throw new Error(`отсъствия: ${error.message}`);
        absentCount = attRows.length;
      }
    }

    showMessage(`Записано ✓ — ${gradeRows.length} резултата, ${remarkRows.length} отзива, ${absentCount} отсъствия.`, true);
    homeworkTitleInput.value = '';
    await loadLessonScreen();
  } catch (e) {
    showMessage(`Грешка при запис: ${e.message}`);
  } finally {
    saveAllBtn.disabled = false;
  }
});

dateInput?.addEventListener('change', async () => {
  await loadSlotsForDate();
  await loadLessonScreen();
});
slotSelect?.addEventListener('change', loadLessonScreen);

(async function init() {
  const ok = await requireTeacher();
  if (!ok) return;
  dateInput.value = todayIso();
  bulkTypeSelect.innerHTML = typeOptions('Тест');
  await loadSlotsForDate();
})();
