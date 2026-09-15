import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const subEl = document.getElementById('stats-sub');
const teacherWrap = document.getElementById('teacher-stats');
const parentWrap = document.getElementById('parent-stats');
const noAccess = document.getElementById('no-access');
const groupSelect = document.getElementById('stats-group');
const fromInput = document.getElementById('stats-from');
const toInput = document.getElementById('stats-to');
const reloadBtn = document.getElementById('stats-reload');
const exportAllBtn = document.getElementById('stats-export-all');
const kpisEl = document.getElementById('stats-kpis');
const rowsEl = document.getElementById('stats-rows');
const parentChildrenEl = document.getElementById('parent-children');

let currentUser = null;
let currentRole = null;
let lastData = null; // { groupName, students, gradesByStudent, absByStudent, from, to }

const TERM_START = '2026-09-01';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function showMessage(text, ok = false) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className = `msg small mb-0 mt-2 ${ok ? 'text-success' : 'text-danger'}`;
}
function todayIso() { return new Date().toISOString().slice(0, 10); }

function pctBadge(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return '<span class="elite-muted">—</span>';
  let band = 2;
  if (n >= 95) band = 6; else if (n >= 85) band = 5; else if (n >= 70) band = 4; else if (n >= 50) band = 3;
  return `<span class="elite-grade elite-grade-${band}">${Math.round(n)}%</span>`;
}

// CSV download (Excel-friendly UTF-8 with BOM).
function downloadCsv(filename, rows) {
  const body = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function fileStamp() { return new Date().toISOString().slice(0, 10); }

async function requireAuth() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) { window.location.href = 'login.html'; return false; }
  currentUser = session.user;
  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
  if (error) { showMessage(`Грешка при профил: ${error.message}`); return false; }
  currentRole = profile.role;
  return true;
}

// --------------------------------------------------------------------------
// Teacher / admin
// --------------------------------------------------------------------------
async function initTeacher() {
  teacherWrap.classList.remove('hidden');
  subEl.textContent = 'Успех и присъствия по твоите групи. Можеш да сваляш репорти за родителите.';

  let q = supabase.from('groups').select('id, name').order('name');
  if (currentRole === 'teacher') q = q.eq('teacher_id', currentUser.id);
  const { data: groups } = await q;

  if (!groups || groups.length === 0) {
    groupSelect.innerHTML = '<option value="">(нямаш групи)</option>';
    rowsEl.innerHTML = '<tr><td colspan="6" class="text-muted">Нямаш групи.</td></tr>';
    return;
  }
  groupSelect.innerHTML = groups.map((g) => `<option value="${esc(g.id)}" data-name="${esc(g.name)}">${esc(g.name)}</option>`).join('');
  fromInput.value = TERM_START;
  toInput.value = todayIso();
  await loadGroupStats();
}

async function loadGroupStats() {
  const gid = groupSelect.value;
  if (!gid) return;
  const groupName = groupSelect.options[groupSelect.selectedIndex]?.dataset.name || '';
  const from = fromInput.value || TERM_START;
  const to = toInput.value || todayIso();
  showMessage('Зареждане...', true);

  // Students
  const { data: gs } = await supabase.from('group_students').select('student_id').eq('group_id', gid);
  const ids = [...new Set((gs || []).map((r) => r.student_id).filter(Boolean))];
  let students = [];
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    const nameById = new Map((profs || []).map((p) => [p.id, p.full_name]));
    students = ids.map((id) => ({ id, name: nameById.get(id) || `#${String(id).slice(0, 8)}` }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'bg'));
  }

  // Grades in period
  const { data: grades } = await supabase.from('grades')
    .select('student_id, percentage, title, graded_on')
    .eq('group_id', gid).gte('graded_on', from).lte('graded_on', to)
    .order('graded_on', { ascending: true });
  const gradesByStudent = new Map();
  (grades || []).forEach((g) => { const a = gradesByStudent.get(g.student_id) || []; a.push(g); gradesByStudent.set(g.student_id, a); });

  // Absences in period (two-step: lessons of the group, then attendance)
  const { data: lessons } = await supabase.from('lessons').select('id').eq('group_id', gid).gte('lesson_date', from).lte('lesson_date', to);
  const lessonIds = (lessons || []).map((l) => l.id);
  const absByStudent = new Map();
  if (lessonIds.length) {
    const { data: att } = await supabase.from('attendance').select('student_id').in('lesson_id', lessonIds).eq('status', 'absent');
    (att || []).forEach((a) => absByStudent.set(a.student_id, (absByStudent.get(a.student_id) || 0) + 1));
  }

  lastData = { groupName, students, gradesByStudent, absByStudent, from, to };
  renderTeacherStats();
  showMessage('');
}

function summaryFor(sid) {
  const gs = lastData.gradesByStudent.get(sid) || [];
  const pcts = gs.map((g) => Number(g.percentage)).filter((n) => Number.isFinite(n));
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const min = pcts.length ? Math.min(...pcts) : null;
  const max = pcts.length ? Math.max(...pcts) : null;
  return { count: gs.length, avg, min, max, abs: lastData.absByStudent.get(sid) || 0 };
}

function renderTeacherStats() {
  const { students } = lastData;
  // Group KPIs
  let allPcts = [];
  let totalGrades = 0, totalAbs = 0;
  students.forEach((s) => {
    const gs = lastData.gradesByStudent.get(s.id) || [];
    totalGrades += gs.length;
    gs.forEach((g) => { const n = Number(g.percentage); if (Number.isFinite(n)) allPcts.push(n); });
    totalAbs += lastData.absByStudent.get(s.id) || 0;
  });
  const groupAvg = allPcts.length ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length) : null;

  kpisEl.innerHTML = `
    <div class="stat"><div class="stat-ic ic-navy"><i class="bi bi-people-fill"></i></div><div class="stat-label">Ученици</div><div class="stat-value">${students.length}</div></div>
    <div class="stat"><div class="stat-ic ic-blue"><i class="bi bi-journal-text"></i></div><div class="stat-label">Оценки</div><div class="stat-value">${totalGrades}</div></div>
    <div class="stat"><div class="stat-ic ic-green"><i class="bi bi-graph-up"></i></div><div class="stat-label">Среден успех</div><div class="stat-value">${groupAvg === null ? '—' : groupAvg + '%'}</div></div>
    <div class="stat"><div class="stat-ic ic-amber"><i class="bi bi-calendar-x"></i></div><div class="stat-label">Отсъствия</div><div class="stat-value">${totalAbs}</div></div>`;

  if (students.length === 0) {
    rowsEl.innerHTML = '<tr><td colspan="6" class="text-muted">В тази група още няма ученици.</td></tr>';
    return;
  }

  rowsEl.innerHTML = students.map((s, i) => {
    const sm = summaryFor(s.id);
    return `<tr>
      <td class="mh-cell-name"><span class="mh-num">${i + 1}</span><span>${esc(s.name)}</span></td>
      <td>${sm.count}</td>
      <td>${sm.avg === null ? '<span class="elite-muted">—</span>' : pctBadge(sm.avg)}</td>
      <td>${sm.min === null ? '<span class="elite-muted">—</span>' : `${pctBadge(sm.min)} / ${pctBadge(sm.max)}`}</td>
      <td>${sm.abs ? `<span class="elite-grade elite-grade-2">${sm.abs}</span>` : '0'}</td>
      <td><button class="btn btn-sm btn-outline-primary js-report" data-id="${esc(s.id)}"><i class="bi bi-download"></i></button></td>
    </tr>`;
  }).join('');

  rowsEl.querySelectorAll('.js-report').forEach((b) => b.addEventListener('click', () => downloadStudentReport(b.dataset.id)));
}

function downloadStudentReport(sid) {
  const student = lastData.students.find((s) => s.id === sid);
  if (!student) return;
  const sm = summaryFor(sid);
  const gs = lastData.gradesByStudent.get(sid) || [];
  const rows = [
    ['ЕЗИКОВА ШКОЛА „ELITE LINGUA" — Индивидуален репорт'],
    ['Ученик', student.name],
    ['Група', lastData.groupName],
    ['Период', `${lastData.from} — ${lastData.to}`],
    [],
    ['Обобщение'],
    ['Брой оценки', sm.count],
    ['Среден успех', sm.avg === null ? '—' : sm.avg + '%'],
    ['Най-нисък / най-висок', sm.min === null ? '—' : `${sm.min}% / ${sm.max}%`],
    ['Отсъствия', sm.abs],
    [],
    ['Дата', 'Тип', 'Резултат %'],
    ...gs.map((g) => [g.graded_on, g.title || '', g.percentage ?? '']),
  ];
  const safe = student.name.replace(/[^\p{L}\p{N}]+/gu, '_');
  downloadCsv(`report-${safe}-${fileStamp()}.csv`, rows);
}

function exportGroupCsv() {
  if (!lastData) return;
  const rows = [
    [`Статистика — ${lastData.groupName} (${lastData.from} — ${lastData.to})`],
    [],
    ['№', 'Ученик', 'Брой оценки', 'Среден %', 'Най-нисък %', 'Най-висок %', 'Отсъствия'],
    ...lastData.students.map((s, i) => {
      const sm = summaryFor(s.id);
      return [i + 1, s.name, sm.count, sm.avg ?? '', sm.min ?? '', sm.max ?? '', sm.abs];
    }),
  ];
  downloadCsv(`statistika-${lastData.groupName}-${fileStamp()}.csv`, rows);
}

// --------------------------------------------------------------------------
// Parent
// --------------------------------------------------------------------------
async function initParent() {
  parentWrap.classList.remove('hidden');
  subEl.textContent = 'Напредъкът на детето ти по оценки и присъствия.';

  const { data: links } = await supabase.from('parent_students')
    .select('student_id, profiles!parent_students_student_id_fkey(full_name)')
    .eq('parent_id', currentUser.id);
  const kids = [...new Map((links || []).map((l) => [l.student_id, { id: l.student_id, name: l.profiles?.full_name || l.student_id }])).values()];

  if (kids.length === 0) {
    parentChildrenEl.innerHTML = '<div class="elite-daycard"><div class="elite-daycard-body text-center text-muted py-4"><i class="bi bi-info-circle me-1"></i>Няма свързани ученици.</div></div>';
    return;
  }
  parentChildrenEl.innerHTML = '';
  for (const kid of kids) await renderChildCard(kid);
}

async function renderChildCard(kid) {
  const { data: grades } = await supabase.from('grades')
    .select('percentage, title, graded_on').eq('student_id', kid.id)
    .order('graded_on', { ascending: false });
  const { data: att } = await supabase.from('attendance').select('id').eq('student_id', kid.id).eq('status', 'absent');

  const pcts = (grades || []).map((g) => Number(g.percentage)).filter((n) => Number.isFinite(n));
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const abs = (att || []).length;

  const recent = (grades || []).slice(0, 12).map((g) => `
    <tr><td>${esc(g.graded_on)}</td><td>${esc(g.title || '')}</td><td>${pctBadge(g.percentage)}</td></tr>`).join('')
    || '<tr><td colspan="3" class="text-muted">Още няма оценки.</td></tr>';

  const card = document.createElement('div');
  card.className = 'elite-daycard mb-3';
  card.innerHTML = `
    <div class="elite-daycard-head">
      <div class="elite-daycard-title"><i class="bi bi-mortarboard"></i>${esc(kid.name)}</div>
      <button class="btn btn-sm btn-outline-primary js-child-report"><i class="bi bi-download me-1"></i>Свали репорт</button>
    </div>
    <div class="elite-daycard-body">
      <div class="stat-row">
        <div class="stat"><div class="stat-ic ic-blue"><i class="bi bi-journal-text"></i></div><div class="stat-label">Оценки</div><div class="stat-value">${(grades || []).length}</div></div>
        <div class="stat"><div class="stat-ic ic-green"><i class="bi bi-graph-up"></i></div><div class="stat-label">Среден успех</div><div class="stat-value">${avg === null ? '—' : avg + '%'}</div></div>
        <div class="stat"><div class="stat-ic ic-amber"><i class="bi bi-calendar-x"></i></div><div class="stat-label">Отсъствия</div><div class="stat-value">${abs}</div></div>
        <div class="stat"><div class="stat-ic ic-navy"><i class="bi bi-star"></i></div><div class="stat-label">Най-висок</div><div class="stat-value">${pcts.length ? Math.max(...pcts) + '%' : '—'}</div></div>
      </div>
      <h3 class="h6 mt-3">Последни оценки</h3>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light"><tr><th>Дата</th><th>Тип</th><th>Резултат</th></tr></thead>
          <tbody>${recent}</tbody>
        </table>
      </div>
    </div>`;

  card.querySelector('.js-child-report').addEventListener('click', () => {
    const rows = [
      ['ЕЗИКОВА ШКОЛА „ELITE LINGUA" — Репорт за напредъка'],
      ['Ученик', kid.name],
      ['Изготвен на', todayIso()],
      [],
      ['Брой оценки', (grades || []).length],
      ['Среден успех', avg === null ? '—' : avg + '%'],
      ['Отсъствия', abs],
      [],
      ['Дата', 'Тип', 'Резултат %'],
      ...(grades || []).map((g) => [g.graded_on, g.title || '', g.percentage ?? '']),
    ];
    const safe = kid.name.replace(/[^\p{L}\p{N}]+/gu, '_');
    downloadCsv(`report-${safe}-${fileStamp()}.csv`, rows);
  });

  parentChildrenEl.appendChild(card);
}

// --------------------------------------------------------------------------
reloadBtn?.addEventListener('click', loadGroupStats);
groupSelect?.addEventListener('change', loadGroupStats);
exportAllBtn?.addEventListener('click', exportGroupCsv);

(async function init() {
  const ok = await requireAuth();
  if (!ok) return;
  if (currentRole === 'teacher' || currentRole === 'admin') {
    await initTeacher();
  } else if (currentRole === 'parent') {
    await initParent();
  } else {
    noAccess.classList.remove('hidden');
    subEl.textContent = 'Виж оценките си от таблото.';
  }
})();
