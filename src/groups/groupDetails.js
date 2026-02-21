import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const studentsBody = document.getElementById('students-body');
const manageSection = document.getElementById('manage-section');
const addForm = document.getElementById('add-student-form');
const logoutBtn = document.getElementById('logout-btn');
const navLogoutBtn = document.getElementById('nav-logout-btn');

const lessonManageSection = document.getElementById('lesson-manage-section');
const createLessonForm = document.getElementById('create-lesson-form');
const lessonsBody = document.getElementById('lessons-body');
const lessonSelect = document.getElementById('attendance-lesson-select');
const loadAttendanceBtn = document.getElementById('load-attendance-btn');
const attendanceManageSection = document.getElementById('attendance-manage-section');
const attendanceBody = document.getElementById('attendance-body');
const saveAttendanceBtn = document.getElementById('save-attendance-btn');

const gradesManageSection = document.getElementById('grades-manage-section');
const createGradeForm = document.getElementById('create-grade-form');
const gradeStudentSelect = document.getElementById('grade-student-id');
const gradeTypeSelect = document.getElementById('grade-type');
const gradeValueSelect = document.getElementById('grade-value');
const gradeDateInput = document.getElementById('grade-date');
const gradesBody = document.getElementById('grades-body');
const homeworksManageSection = document.getElementById('homeworks-manage-section');
const createHomeworkForm = document.getElementById('create-homework-form');
const homeworksBody = document.getElementById('homeworks-body');
const submissionsSection = document.getElementById('submissions-section');
const submissionsBody = document.getElementById('submissions-body');
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

function gradeLabel(value) {
  const n = Number(value);
  if (n === 2) return 'Слаб';
  if (n === 3) return 'Среден';
  if (n === 4) return 'Добър';
  if (n === 5) return 'Много добър';
  if (n === 6) return 'Отличен';
  return String(value);
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
    attendanceManageSection.classList.remove('hidden');
    gradesManageSection.classList.remove('hidden');
    homeworksManageSection.classList.remove('hidden');
    submissionsSection.classList.remove('hidden');
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
  if (!gradeStudentSelect) return;

  if (!groupStudents.length) {
    gradeStudentSelect.innerHTML = '<option value="">Няма ученици</option>';
    return;
  }

  gradeStudentSelect.innerHTML = groupStudents
    .map((row) => `<option value="${escapeHtml(row.student_id)}">${escapeHtml(row.student_id)}</option>`)
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
  renderStudentSelectOptions();
  setKpiText(kpiStudentsEl, String(groupStudents.length));

  if (!data || data.length === 0) {
    studentsBody.innerHTML = '<tr><td colspan="4" class="elite-empty"><i class="bi bi-inbox"></i>Няма ученици в тази група.</td></tr>';
    attendanceBody.innerHTML = '<tr><td colspan="2" class="elite-empty"><i class="bi bi-inbox"></i>Няма ученици за присъствия.</td></tr>';
    return;
  }

  studentsBody.innerHTML = data
    .map((row) => {
      const deleteBtn = canManage()
        ? `<button class="btn danger js-remove" data-id="${escapeHtml(row.id)}">Премахни</button>`
        : '-';

      return `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.student_id)}</td>
          <td>${escapeHtml(new Date(row.enrolled_at).toLocaleString('bg-BG'))}</td>
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

  const studentId = document.getElementById('student-id').value.trim();
  if (!studentId) {
    showMessage('Въведи student UUID.');
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
    lessonSelect.innerHTML = '<option value="">Няма уроци</option>';
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

  lessonSelect.innerHTML = data
    .map((lesson) => `<option value="${escapeHtml(lesson.id)}">${escapeHtml(lesson.lesson_date)} - ${escapeHtml(lesson.topic)}</option>`)
    .join('');

  if (lessonIdFromQuery && data.some((lesson) => lesson.id === lessonIdFromQuery)) {
    lessonSelect.value = lessonIdFromQuery;
    await loadAttendanceForSelectedLesson();
    showMessage('Зареден е избраният урок и присъствията му.');
  }
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

async function loadAttendanceForSelectedLesson() {
  const lessonId = lessonSelect.value;

  if (!lessonId) {
    showMessage('Избери урок.');
    return;
  }

  if (groupStudents.length === 0) {
    showMessage('Няма ученици в групата.');
    return;
  }

  showMessage('Зареждаме присъствия...');

  const { data: existing, error } = await supabase
    .from('attendance')
    .select('id, student_id, status')
    .eq('lesson_id', lessonId);

  if (error) {
    showMessage(`Грешка при зареждане на присъствия: ${error.message}`);
    return;
  }

  const byStudent = new Map((existing || []).map((row) => [row.student_id, row.status]));

  attendanceBody.innerHTML = groupStudents
    .map((row) => {
      const status = byStudent.get(row.student_id) || 'present';
      return `
        <tr>
          <td>${escapeHtml(row.student_id)}</td>
          <td>
            <select class="js-att-status" data-student-id="${escapeHtml(row.student_id)}">
              <option value="present" ${status === 'present' ? 'selected' : ''}>Присъства</option>
              <option value="late" ${status === 'late' ? 'selected' : ''}>Закъснял</option>
              <option value="absent" ${status === 'absent' ? 'selected' : ''}>Отсъства</option>
            </select>
          </td>
        </tr>
      `;
    })
    .join('');

  showMessage('Присъствията са заредени.');
}

loadAttendanceBtn?.addEventListener('click', async () => {
  await loadAttendanceForSelectedLesson();
});

saveAttendanceBtn?.addEventListener('click', async () => {
  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  const lessonId = lessonSelect.value;
  if (!lessonId) {
    showMessage('Избери урок.');
    return;
  }

  const rows = Array.from(document.querySelectorAll('.js-att-status')).map((el) => ({
    lesson_id: lessonId,
    student_id: el.getAttribute('data-student-id'),
    status: el.value,
  }));

  if (rows.length === 0) {
    showMessage('Няма данни за запис. Зареди присъствията първо.');
    return;
  }

  showMessage('Записваме присъствия...');

  const { error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'lesson_id,student_id' });

  if (error) {
    showMessage(`Грешка при запис на присъствия: ${error.message}`);
    return;
  }

  showMessage('Присъствията са записани успешно.');
});

async function loadGrades() {
  const { data, error } = await supabase
    .from('grades')
    .select('id, student_id, title, grade_value, graded_on')
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
        <td>${escapeHtml(g.student_id)}</td>
        <td>${escapeHtml(g.title)}</td>
        <td>${escapeHtml(g.grade_value)} - ${escapeHtml(gradeLabel(g.grade_value))}</td>
      </tr>
    `)
    .join('');
}

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
          <td>${escapeHtml(row.student_id)}</td>
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
  const gradeValue = Number(gradeValueSelect.value);
  const gradeDate = gradeDateInput.value;

  if (!studentId || !gradeType || !gradeDate) {
    showMessage('Попълни всички полета за оценката.');
    return;
  }

  showMessage('Добавяме оценка...');

  const { error } = await supabase.from('grades').insert({
    group_id: groupId,
    student_id: studentId,
    grade_value: gradeValue,
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
  await loadHomeworks();
  await loadHomeworkSubmissionsForManagers();
})();



