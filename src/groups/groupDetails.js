import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const studentsBody = document.getElementById('students-body');
const manageSection = document.getElementById('manage-section');
const addForm = document.getElementById('add-student-form');
const addStudentSelect = document.getElementById('student-id');
const logoutBtn = document.getElementById('logout-btn');
const navLogoutBtn = document.getElementById('nav-logout-btn');

const lessonManageSection = document.getElementById('lesson-manage-section');
const createLessonForm = document.getElementById('create-lesson-form');
const lessonsBody = document.getElementById('lessons-body');

const gradesManageSection = document.getElementById('grades-manage-section');
const createGradeForm = document.getElementById('create-grade-form');
const gradeStudentSelect = document.getElementById('grade-student-id');
const gradeTypeSelect = document.getElementById('grade-type');
const gradePercentInput = document.getElementById('grade-percent');
const gradeDateInput = document.getElementById('grade-date');
const gradesBody = document.getElementById('grades-body');
const homeworksManageSection = document.getElementById('homeworks-manage-section');
const createHomeworkForm = document.getElementById('create-homework-form');
const homeworksBody = document.getElementById('homeworks-body');
const submissionsSection = document.getElementById('submissions-section');
const submissionsBody = document.getElementById('submissions-body');
const remarksManageSection = document.getElementById('remarks-manage-section');
const createRemarkForm = document.getElementById('create-remark-form');
const remarkStudentSelect = document.getElementById('remark-student-id');
const remarkTypeSelect = document.getElementById('remark-type');
const remarkNoteInput = document.getElementById('remark-note');
const remarksBody = document.getElementById('remarks-body');
const kpiStudentsEl = document.getElementById('kpi-gd-students');
const kpiLessonsEl = document.getElementById('kpi-gd-lessons');
const kpiGradesEl = document.getElementById('kpi-gd-grades');
const kpiHomeworksEl = document.getElementById('kpi-gd-homeworks');

const groupNameEl = document.getElementById('group-name');
const groupLanguageEl = document.getElementById('group-language');
const groupLevelEl = document.getElementById('group-level');

const params = new URLSearchParams(window.location.search);
const groupId = params.get('groupId');
const lessonIdFromQuery = params.get('lessonId');

let currentUser = null;
let currentRole = null;
let groupStudents = [];
const studentNames = new Map(); // student_id -> full_name

function showMessage(text) {
  msgEl.textContent = text;
}

function setKpiText(el, value) {
  if (!el) return;
  el.textContent = value;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function canManage() {
  return currentRole === 'admin' || currentRole === 'teacher';
}

// Human-friendly label for a student id: full name if known, else a short id.
function studentLabel(id) {
  const name = studentNames.get(id);
  if (name) return name;
  return id ? `#${String(id).slice(0, 8)}` : '-';
}

async function loadStudentNames(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique);

  if (error) return; // fall back to short ids
  (data || []).forEach((p) => studentNames.set(p.id, p.full_name || null));
}

function canSubmitHomework() {
  return currentRole === 'student';
}

async function canAccessGroup(targetGroupId) {
  if (!targetGroupId) return false;

  if (currentRole === 'admin') {
    return true;
  }

  if (currentRole === 'teacher') {
    const { data, error } = await supabase
      .from('groups')
      .select('id')
      .eq('id', targetGroupId)
      .or(`teacher_id.eq.${currentUser.id},created_by.eq.${currentUser.id}`)
      .maybeSingle();

    if (error) {
      showMessage(`Грешка при проверка на достъп: ${error.message}`);
      return false;
    }

    return Boolean(data);
  }

  if (currentRole === 'student') {
    const { data, error } = await supabase
      .from('group_students')
      .select('id')
      .eq('group_id', targetGroupId)
      .eq('student_id', currentUser.id)
      .maybeSingle();

    if (error) {
      showMessage(`Грешка при проверка на достъп: ${error.message}`);
      return false;
    }

    return Boolean(data);
  }

  if (currentRole === 'parent') {
    const { data: links, error: linksError } = await supabase
      .from('parent_students')
      .select('student_id')
      .eq('parent_id', currentUser.id);

    if (linksError) {
      showMessage(`Грешка при връзка родител-ученик: ${linksError.message}`);
      return false;
    }

    const studentIds = [...new Set((links || []).map((row) => row.student_id).filter(Boolean))];
    if (studentIds.length === 0) return false;

    const { data, error } = await supabase
      .from('group_students')
      .select('id')
      .eq('group_id', targetGroupId)
      .in('student_id', studentIds)
      .maybeSingle();

    if (error) {
      showMessage(`Грешка при проверка на достъп: ${error.message}`);
      return false;
    }

    return Boolean(data);
  }

  return false;
}

// Colour-coded percentage badge (result 0–100%), banded red→green.
function percentBadge(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return escapeHtml(String(pct ?? '-'));
  let band = 2;
  if (n >= 95) band = 6;
  else if (n >= 85) band = 5;
  else if (n >= 70) band = 4;
  else if (n >= 50) band = 3;
  return `<span class="elite-grade elite-grade-${band}">${escapeHtml(String(Math.round(n)))}%</span>`;
}

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sanitizeFileName(fileName) {
  return String(fileName || 'file')
    .replaceAll(' ', '_')
    .replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function formatDateTimeBg(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return escapeHtml(value);
  return escapeHtml(dt.toLocaleString('bg-BG'));
}

async function requireAuth() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    window.location.href = 'login.html';
    return false;
  }

  currentUser = session.user;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.id)
    .single();

  if (error) {
    showMessage(`Грешка при профил: ${error.message}`);
    return false;
  }

  currentRole = profile.role;

  if (canManage()) {
    manageSection.classList.remove('hidden');
    lessonManageSection.classList.remove('hidden');
    gradesManageSection.classList.remove('hidden');
    homeworksManageSection.classList.remove('hidden');
    submissionsSection.classList.remove('hidden');
    remarksManageSection.classList.remove('hidden');
  }

  return true;
}

async function loadGroup() {
  if (!groupId) {
    showMessage('Липсва groupId в адреса.');
    return;
  }

  const { data, error } = await supabase
    .from('groups')
    .select('id, name, language, level')
    .eq('id', groupId)
    .single();

  if (error) {
    showMessage(`Грешка при групата: ${error.message}`);
    return;
  }

  groupNameEl.textContent = data.name;
  groupLanguageEl.textContent = data.language;
  groupLevelEl.textContent = data.level;
}

function renderStudentSelectOptions() {
  const optionsHtml = groupStudents.length
    ? groupStudents
        .map((row) => `<option value="${escapeHtml(row.student_id)}">${escapeHtml(studentLabel(row.student_id))}</option>`)
        .join('')
    : '<option value="">Няма ученици</option>';

  if (gradeStudentSelect) gradeStudentSelect.innerHTML = optionsHtml;
  if (remarkStudentSelect) remarkStudentSelect.innerHTML = optionsHtml;
}

// Populate the "add student" dropdown with students not yet in this group.
async function loadAddStudentOptions() {
  if (!addStudentSelect) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'student')
    .order('full_name', { nullsFirst: false });

  if (error) {
    addStudentSelect.innerHTML = '<option value="">(грешка при зареждане на ученици)</option>';
    return;
  }

  const enrolled = new Set(groupStudents.map((r) => r.student_id));
  const available = (data || []).filter((s) => !enrolled.has(s.id));

  if (available.length === 0) {
    addStudentSelect.innerHTML = '<option value="">Няма свободни ученици</option>';
    return;
  }

  addStudentSelect.innerHTML = '<option value="">Избери ученик…</option>'
    + available
        .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.full_name || `#${String(s.id).slice(0, 8)}`)}</option>`)
        .join('');
}

async function loadStudents() {
  const { data, error } = await supabase
    .from('group_students')
    .select('id, student_id, enrolled_at')
    .eq('group_id', groupId)
    .order('enrolled_at', { ascending: false });

  if (error) {
    showMessage(`Грешка при зареждане на ученици: ${error.message}`);
    return;
  }

  groupStudents = data || [];
  await loadStudentNames(groupStudents.map((r) => r.student_id));
  renderStudentSelectOptions();
  if (canManage()) await loadAddStudentOptions();
  setKpiText(kpiStudentsEl, String(groupStudents.length));

  if (!data || data.length === 0) {
    studentsBody.innerHTML = '<tr><td colspan="3" class="elite-empty"><i class="bi bi-inbox"></i>Няма ученици в тази група.</td></tr>';
    return;
  }

  studentsBody.innerHTML = data
    .map((row) => {
      const deleteBtn = canManage()
        ? `<button class="btn btn-sm btn-outline-danger js-remove" data-id="${escapeHtml(row.id)}"><i class="bi bi-person-dash me-1"></i>Премахни</button>`
        : '-';

      return `
        <tr>
          <td class="fw-semibold"><i class="bi bi-person-circle me-1 text-secondary"></i>${escapeHtml(studentLabel(row.student_id))}</td>
          <td class="text-nowrap">${escapeHtml(new Date(row.enrolled_at).toLocaleString('bg-BG'))}</td>
          <td>${deleteBtn}</td>
        </tr>
      `;
    })
    .join('');

  studentsBody.querySelectorAll('.js-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await removeStudent(id);
    });
  });
}

async function removeStudent(id) {
  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  showMessage('Премахваме...');

  const { error } = await supabase
    .from('group_students')
    .delete()
    .eq('id', id);

  if (error) {
    showMessage(`Грешка при премахване: ${error.message}`);
    return;
  }

  showMessage('Ученикът е премахнат.');
  await loadStudents();
  await loadGrades();
}

addForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  const studentId = addStudentSelect.value.trim();
  if (!studentId) {
    showMessage('Избери ученик от списъка.');
    return;
  }

  const { data: studentProfile, error: studentCheckError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', studentId)
    .maybeSingle();

  if (studentCheckError) {
    showMessage(`Грешка при проверка на ученик: ${studentCheckError.message}`);
    return;
  }

  if (!studentProfile || studentProfile.role !== 'student') {
    showMessage('Подаденият UUID не е валиден ученик.');
    return;
  }

  showMessage('Добавяме...');

  const { error } = await supabase.from('group_students').insert({
    group_id: groupId,
    student_id: studentId,
  });

  if (error) {
    showMessage(`Грешка при добавяне: ${error.message}`);
    return;
  }

  addForm.reset();
  showMessage('Ученикът е добавен в групата.');
  await loadStudents();
});

async function loadLessons() {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, lesson_date, topic, notes')
    .eq('group_id', groupId)
    .order('lesson_date', { ascending: false });

  if (error) {
    showMessage(`Грешка при зареждане на уроци: ${error.message}`);
    setKpiText(kpiLessonsEl, '-');
    return;
  }

  if (!data || data.length === 0) {
    lessonsBody.innerHTML = '<tr><td colspan="3" class="elite-empty"><i class="bi bi-inbox"></i>Няма уроци за тази група.</td></tr>';
    setKpiText(kpiLessonsEl, '0');
    return;
  }

  setKpiText(kpiLessonsEl, String(data.length));

  lessonsBody.innerHTML = data
    .map((lesson) => `
      <tr>
        <td>${escapeHtml(lesson.lesson_date)}</td>
        <td>${escapeHtml(lesson.topic)}</td>
        <td>${escapeHtml(lesson.notes ?? '-')}</td>
      </tr>
    `)
    .join('');
}

createLessonForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  const lessonDate = document.getElementById('lesson-date').value;
  const topic = document.getElementById('lesson-topic').value.trim();
  const notes = document.getElementById('lesson-notes').value.trim();

  if (!lessonDate || !topic) {
    showMessage('Попълни дата и тема за урока.');
    return;
  }

  showMessage('Добавяме урок...');

  const { error } = await supabase.from('lessons').insert({
    group_id: groupId,
    lesson_date: lessonDate,
    topic,
    notes: notes || null,
    created_by: currentUser.id,
  });

  if (error) {
    showMessage(`Грешка при създаване на урок: ${error.message}`);
    return;
  }

  createLessonForm.reset();
  showMessage('Урокът е добавен.');
  await loadLessons();
});

async function loadGrades() {
  const { data, error } = await supabase
    .from('grades')
    .select('id, student_id, title, percentage, graded_on')
    .eq('group_id', groupId)
    .order('graded_on', { ascending: false });

  if (error) {
    showMessage(`Грешка при зареждане на оценки: ${error.message}`);
    setKpiText(kpiGradesEl, '-');
    return;
  }

  if (!data || data.length === 0) {
    gradesBody.innerHTML = '<tr><td colspan="4" class="elite-empty"><i class="bi bi-inbox"></i>Няма оценки за тази група.</td></tr>';
    setKpiText(kpiGradesEl, '0');
    return;
  }

  setKpiText(kpiGradesEl, String(data.length));

  gradesBody.innerHTML = data
    .map((g) => `
      <tr>
        <td>${escapeHtml(g.graded_on)}</td>
        <td>${escapeHtml(studentLabel(g.student_id))}</td>
        <td>${escapeHtml(g.title)}</td>
        <td>${percentBadge(g.percentage)}</td>
      </tr>
    `)
    .join('');
}

function remarkTypeBadge(type) {
  if (type === 'praise') {
    return '<span class="elite-sticker elite-sticker-praise"><i class="bi bi-emoji-smile-fill"></i>Похвала</span>';
  }
  return '<span class="elite-sticker elite-sticker-remark"><i class="bi bi-exclamation-triangle-fill"></i>Забележка</span>';
}

async function loadRemarks() {
  if (!remarksBody) return;

  const { data, error } = await supabase
    .from('remarks')
    .select('id, student_id, type, note, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) {
    remarksBody.innerHTML = `<tr><td colspan="5" class="elite-empty"><i class="bi bi-exclamation-triangle"></i>Грешка при зареждане: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    remarksBody.innerHTML = '<tr><td colspan="5" class="elite-empty"><i class="bi bi-inbox"></i>Няма забележки или похвали за тази група.</td></tr>';
    return;
  }

  remarksBody.innerHTML = data
    .map((r) => {
      const deleteBtn = canManage()
        ? `<button class="btn btn-sm btn-outline-danger js-del-remark" data-id="${escapeHtml(r.id)}" title="Изтрий"><i class="bi bi-trash"></i></button>`
        : '-';
      return `
        <tr>
          <td class="text-nowrap">${escapeHtml(new Date(r.created_at).toLocaleString('bg-BG'))}</td>
          <td>${escapeHtml(studentLabel(r.student_id))}</td>
          <td>${remarkTypeBadge(r.type)}</td>
          <td>${escapeHtml(r.note)}</td>
          <td>${deleteBtn}</td>
        </tr>
      `;
    })
    .join('');

  remarksBody.querySelectorAll('.js-del-remark').forEach((btn) => {
    btn.addEventListener('click', () => deleteRemark(btn.getAttribute('data-id')));
  });
}

async function deleteRemark(id) {
  if (!id || !canManage()) return;
  showMessage('Изтриваме...');
  const { error } = await supabase.from('remarks').delete().eq('id', id);
  if (error) {
    showMessage(`Грешка при изтриване: ${error.message}`);
    return;
  }
  showMessage('Записът е изтрит.');
  await loadRemarks();
}

createRemarkForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  const studentId = remarkStudentSelect.value;
  const type = remarkTypeSelect.value;
  const note = remarkNoteInput.value.trim();

  if (!studentId || !type || note.length < 2) {
    showMessage('Избери ученик, тип и въведи текст (мин. 2 символа).');
    return;
  }

  showMessage('Записваме...');

  const { error } = await supabase.from('remarks').insert({
    group_id: groupId,
    student_id: studentId,
    type,
    note,
    created_by: currentUser.id,
  });

  if (error) {
    showMessage(`Грешка при запис: ${error.message}`);
    return;
  }

  createRemarkForm.reset();
  showMessage('Записът е добавен.');
  await loadRemarks();
});

async function loadHomeworks() {
  const { data, error } = await supabase
    .from('homeworks')
    .select('id, title, description, due_date')
    .eq('group_id', groupId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) {
    showMessage(`Грешка при зареждане на домашни: ${error.message}`);
    setKpiText(kpiHomeworksEl, '-');
    return;
  }

  if (!data || data.length === 0) {
    homeworksBody.innerHTML = '<tr><td colspan="5" class="elite-empty"><i class="bi bi-inbox"></i>Няма домашни работи за тази група.</td></tr>';
    setKpiText(kpiHomeworksEl, '0');
    return;
  }

  setKpiText(kpiHomeworksEl, String(data.length));

  const homeworkIds = data.map((h) => h.id);
  let submissionsByHomework = new Map();
  let fileUrlByPath = new Map();

  if (canSubmitHomework() && homeworkIds.length > 0) {
    const { data: submissions, error: submissionsError } = await supabase
      .from('homework_submissions')
      .select('id, homework_id, status, file_path, submitted_at')
      .eq('student_id', currentUser.id)
      .in('homework_id', homeworkIds);

    if (submissionsError) {
      showMessage(`Грешка при зареждане на предадени домашни: ${submissionsError.message}`);
      return;
    }

    submissionsByHomework = new Map((submissions || []).map((s) => [s.homework_id, s]));

    const filePaths = [...new Set((submissions || []).map((s) => s.file_path).filter(Boolean))];
    await Promise.all(
      filePaths.map(async (path) => {
        const { data: signed, error: signError } = await supabase.storage
          .from('homework-files')
          .createSignedUrl(path, 60 * 60);

        if (!signError && signed?.signedUrl) {
          fileUrlByPath.set(path, signed.signedUrl);
        }
      })
    );
  }

  homeworksBody.innerHTML = data
    .map((h) => {
      const submission = submissionsByHomework.get(h.id);
      const filePath = submission?.file_path || null;
      const fileUrl = filePath ? fileUrlByPath.get(filePath) : null;

      let fileCell = '-';
      if (fileUrl) {
        fileCell = `<a class="btn" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">Свали</a>`;
      } else if (submission?.submitted_at) {
        fileCell = `Предадено: ${formatDateTimeBg(submission.submitted_at)}`;
      }

      let actionCell = '-';
      if (canSubmitHomework()) {
        actionCell = `
          <input type="file" class="js-homework-file" data-homework-id="${escapeHtml(h.id)}" />
          <button class="btn js-homework-upload" data-homework-id="${escapeHtml(h.id)}" type="button">Качи</button>
        `;
      }

      return `
        <tr>
          <td>${escapeHtml(h.due_date ?? '-')}</td>
          <td>${escapeHtml(h.title)}</td>
          <td>${escapeHtml(h.description ?? '-')}</td>
          <td>${fileCell}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    })
    .join('');

  if (canSubmitHomework()) {
    homeworksBody.querySelectorAll('.js-homework-upload').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const homeworkId = btn.getAttribute('data-homework-id');
        const input = Array.from(homeworksBody.querySelectorAll('.js-homework-file'))
          .find((el) => el.getAttribute('data-homework-id') === homeworkId);
        const file = input?.files?.[0];
        await uploadHomeworkFile(homeworkId, file);
      });
    });
  }
}

async function loadHomeworkSubmissionsForManagers() {
  if (!canManage()) return;

  const { data, error } = await supabase
    .from('homework_submissions')
    .select(`
      id,
      homework_id,
      student_id,
      status,
      file_path,
      submitted_at,
      homeworks!inner(group_id, title)
    `)
    .eq('homeworks.group_id', groupId)
    .order('submitted_at', { ascending: false, nullsFirst: false });

  if (error) {
    showMessage(`Грешка при предадените домашни: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    submissionsBody.innerHTML = '<tr><td colspan="5" class="elite-empty"><i class="bi bi-inbox"></i>Няма предадени файлове.</td></tr>';
    return;
  }

  const filePaths = [...new Set(data.map((row) => row.file_path).filter(Boolean))];
  const fileUrlByPath = new Map();

  await Promise.all(
    filePaths.map(async (path) => {
      const { data: signed, error: signError } = await supabase.storage
        .from('homework-files')
        .createSignedUrl(path, 60 * 60);

      if (!signError && signed?.signedUrl) {
        fileUrlByPath.set(path, signed.signedUrl);
      }
    })
  );

  submissionsBody.innerHTML = data
    .map((row) => {
      const fileUrl = row.file_path ? fileUrlByPath.get(row.file_path) : null;
      const fileCell = fileUrl
        ? `<a class="btn" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">Свали</a>`
        : '-';

      return `
        <tr>
          <td>${escapeHtml(row.homeworks?.title ?? '-')}</td>
          <td>${escapeHtml(studentLabel(row.student_id))}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${formatDateTimeBg(row.submitted_at)}</td>
          <td>${fileCell}</td>
        </tr>
      `;
    })
    .join('');
}

async function uploadHomeworkFile(homeworkId, file) {
  if (!canSubmitHomework()) {
    showMessage('Само ученик може да качва файл за домашно.');
    return;
  }

  if (!homeworkId) {
    showMessage('Липсва домашно за качване.');
    return;
  }

  if (!file) {
    showMessage('Избери файл.');
    return;
  }

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    showMessage('Файлът е твърде голям. Максимум 10MB.');
    return;
  }

  const cleanName = sanitizeFileName(file.name);
  const filePath = `${currentUser.id}/${homeworkId}/${Date.now()}-${cleanName}`;

  showMessage('Качваме файл...');

  const { error: uploadError } = await supabase.storage
    .from('homework-files')
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    showMessage(`Грешка при качване: ${uploadError.message}`);
    return;
  }

  const { error: dbError } = await supabase
    .from('homework_submissions')
    .upsert(
      {
        homework_id: homeworkId,
        student_id: currentUser.id,
        status: 'submitted',
        file_path: filePath,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'homework_id,student_id' }
    );

  if (dbError) {
    showMessage(`Грешка при запис на домашното: ${dbError.message}`);
    return;
  }

  showMessage('Файлът е качен успешно.');
  await loadHomeworks();
}

createGradeForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  const studentId = gradeStudentSelect.value;
  const gradeType = gradeTypeSelect.value;
  const percent = Number(gradePercentInput.value);
  const gradeDate = gradeDateInput.value;

  if (!studentId || !gradeType || !gradeDate || gradePercentInput.value === '') {
    showMessage('Попълни ученик, тип, резултат (%) и дата.');
    return;
  }

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    showMessage('Резултатът трябва да е между 0 и 100%.');
    return;
  }

  showMessage('Добавяме оценка...');

  const { error } = await supabase.from('grades').insert({
    group_id: groupId,
    student_id: studentId,
    percentage: percent,
    title: gradeType,
    description: null,
    graded_on: gradeDate,
    created_by: currentUser.id,
  });

  if (error) {
    showMessage(`Грешка при добавяне на оценка: ${error.message}`);
    return;
  }

  createGradeForm.reset();
  gradeDateInput.value = todayIsoDate();
  showMessage('Оценката е добавена успешно.');
  await loadGrades();
});

createHomeworkForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  const title = document.getElementById('homework-title').value.trim();
  const description = document.getElementById('homework-description').value.trim();
  const dueDate = document.getElementById('homework-due-date').value;

  if (!title) {
    showMessage('Въведи заглавие за домашното.');
    return;
  }

  showMessage('Добавяме домашно...');

  const { error } = await supabase.from('homeworks').insert({
    group_id: groupId,
    title,
    description: description || null,
    due_date: dueDate || null,
    created_by: currentUser.id,
  });

  if (error) {
    showMessage(`Грешка при добавяне на домашно: ${error.message}`);
    return;
  }

  createHomeworkForm.reset();
  showMessage('Домашното е добавено успешно.');
  await loadHomeworks();
});

async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

logoutBtn?.addEventListener('click', logout);
navLogoutBtn?.addEventListener('click', logout);

(async function init() {
  const ok = await requireAuth();
  if (!ok) return;

  const hasAccess = await canAccessGroup(groupId);
  if (!hasAccess) {
    showMessage('Нямаш достъп до тази група.');
    return;
  }

  gradeDateInput.value = todayIsoDate();

  await loadGroup();
  await loadStudents();
  await loadLessons();
  await loadGrades();
  await loadRemarks();
  await loadHomeworks();
  await loadHomeworkSubmissionsForManagers();
})();



