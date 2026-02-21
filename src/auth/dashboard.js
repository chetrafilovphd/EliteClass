import { supabase } from '../lib/supabaseClient.js';

const nameEl = document.getElementById('user-name');
const roleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');
const navLogoutBtn = document.getElementById('nav-logout-btn');
const parentLinksBtn = document.getElementById('parent-links-btn');
const parentLinksQuick = document.getElementById('parent-links-quick');
const myHoursQuick = document.getElementById('my-hours-quick');
const navMyHoursItem = document.getElementById('nav-my-hours-item');

const kpiGroupsEl = document.getElementById('kpi-groups');
const kpiStudentsEl = document.getElementById('kpi-students');
const kpiLessonsEl = document.getElementById('kpi-lessons');
const kpiEventsEl = document.getElementById('kpi-events');
const recentEventsBody = document.getElementById('recent-events-body');
const infoNoteEl = document.getElementById('dashboard-info-note');

const profileForm = document.getElementById('profile-form');
const profileMsgEl = document.getElementById('profile-msg');
const profileFullNameEl = document.getElementById('profile-full-name');
const profileEmailEl = document.getElementById('profile-email');
const profilePhoneEl = document.getElementById('profile-phone');
const profileTitleEl = document.getElementById('profile-title');
const profileAddressEl = document.getElementById('profile-address');
const profileAvatarUrlEl = document.getElementById('profile-avatar-url');
const profileAvatarFileEl = document.getElementById('profile-avatar-file');
const profileAvatarPreviewEl = document.getElementById('profile-avatar-preview');
const profileSchemaNoteEl = document.getElementById('profile-schema-note');
const saveProfileBtn = document.getElementById('save-profile-btn');

const teacherScheduleSectionEl = document.getElementById('teacher-schedule-section');
const weekScheduleBodyEl = document.getElementById('week-schedule-body');

const teacherPanelEl = document.getElementById('teacher-panel');
const teacherLessonsBodyEl = document.getElementById('teacher-lessons-body');
const studentPanelEl = document.getElementById('student-panel');
const studentWeekBodyEl = document.getElementById('student-week-body');
const studentGradesBodyEl = document.getElementById('student-grades-body');
const studentHomeworksBodyEl = document.getElementById('student-homeworks-body');
const parentPanelEl = document.getElementById('parent-panel');
const parentOverviewBodyEl = document.getElementById('parent-overview-body');

let currentSession = null;
let currentProfile = null;
let hasExtendedProfileColumns = true;

function formatBgDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('bg-BG');
}

function formatBgDate(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString('bg-BG');
}

function setSafeText(el, value) {
  if (!el) return;
  el.textContent = value;
}

function showInfoNote(text) {
  if (!infoNoteEl) return;
  infoNoteEl.textContent = text;
  infoNoteEl.classList.remove('hidden');
}

function showProfileMessage(text, type = 'danger') {
  if (!profileMsgEl) return;
  profileMsgEl.textContent = text;
  profileMsgEl.classList.remove('text-danger', 'text-success', 'text-warning');
  if (type === 'success') profileMsgEl.classList.add('text-success');
  else if (type === 'warning') profileMsgEl.classList.add('text-warning');
  else profileMsgEl.classList.add('text-danger');
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function roleLabel(role) {
  if (role === 'admin') return 'Администратор';
  if (role === 'teacher') return 'Учител';
  if (role === 'student') return 'Ученик';
  if (role === 'parent') return 'Родител';
  return role || 'Неопределена';
}

function sanitizeRole(role) {
  const allowed = ['admin', 'teacher', 'student', 'parent'];
  return allowed.includes(role) ? role : null;
}

function setAvatarPreview(url) {
  if (!profileAvatarPreviewEl) return;
  profileAvatarPreviewEl.src = url || 'logoEliteLingua.jpg';
}

function fileExtension(filename) {
  const m = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : 'jpg';
}

function hideRolePanels() {
  teacherPanelEl?.classList.add('hidden');
  studentPanelEl?.classList.add('hidden');
  parentPanelEl?.classList.add('hidden');
  navMyHoursItem?.classList.add('hidden');
  myHoursQuick?.classList.add('hidden');
}

async function safeCount(tableName, filterFn) {
  try {
    let query = supabase.from(tableName).select('*', { count: 'exact', head: true });
    if (typeof filterFn === 'function') query = filterFn(query);
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function loadKpis() {
  const [groupsCount, studentsCount, lessonsCount] = await Promise.all([
    safeCount('groups'),
    safeCount('group_students'),
    safeCount('lessons'),
  ]);

  setSafeText(kpiGroupsEl, groupsCount === null ? '-' : String(groupsCount));
  setSafeText(kpiStudentsEl, studentsCount === null ? '-' : String(studentsCount));
  setSafeText(kpiLessonsEl, lessonsCount === null ? '-' : String(lessonsCount));

  const today = new Date();
  const fromIso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const eventsCount = await safeCount('school_events', (q) => q.gte('starts_at', fromIso));
  setSafeText(kpiEventsEl, eventsCount === null ? '-' : String(eventsCount));
}

async function loadRecentEvents() {
  if (!recentEventsBodyEl) return;
  const today = new Date();
  const fromIso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  const { data, error } = await supabase
    .from('school_events')
    .select('id, title, starts_at, groups(name)')
    .gte('starts_at', fromIso)
    .order('starts_at', { ascending: true })
    .limit(5);

  if (error) {
    recentEventsBodyEl.innerHTML = '<tr><td colspan="3">Събитията не са налични.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    recentEventsBodyEl.innerHTML = '<tr><td colspan="3">Няма предстоящи събития.</td></tr>';
    return;
  }

  recentEventsBodyEl.innerHTML = data
    .map((ev) => `
      <tr>
        <td>${escapeHtml(formatBgDateTime(ev.starts_at))}</td>
        <td>${escapeHtml(ev.title ?? '-')}</td>
        <td>${escapeHtml(ev.groups?.name ?? 'Глобално')}</td>
      </tr>
    `)
    .join('');
}

async function ensureProfile(session) {
  const userId = session.user.id;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  if (profile) {
    const nextValues = {};

    if (!profile.full_name && session.user.user_metadata?.full_name) {
      nextValues.full_name = session.user.user_metadata.full_name;
    }

    const metaRole = sanitizeRole(session.user.user_metadata?.role);
    if (metaRole && profile.role !== 'admin' && profile.role !== metaRole) {
      nextValues.role = metaRole;
    }

    if (Object.keys(nextValues).length > 0) {
      await supabase.from('profiles').update(nextValues).eq('id', userId);
      Object.assign(profile, nextValues);
    }

    return profile;
  }

  const metaRole = sanitizeRole(session.user.user_metadata?.role) || 'student';
  const fullName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Потребител';

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      full_name: fullName,
      role: metaRole,
    })
    .select('id, full_name, role, phone, avatar_url')
    .single();

  if (insertError) throw insertError;
  return inserted;
}

async function loadExtendedProfileFields(userId) {
  if (!profileTitleEl || !profileAddressEl) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('teacher_title, address')
      .eq('id', userId)
      .single();

    if (error) throw error;

    hasExtendedProfileColumns = true;
    profileTitleEl.value = data?.teacher_title || '';
    profileAddressEl.value = data?.address || '';
    profileTitleEl.disabled = false;
    profileAddressEl.disabled = false;
    profileSchemaNoteEl?.classList.add('hidden');
  } catch {
    hasExtendedProfileColumns = false;
    profileTitleEl.value = '';
    profileAddressEl.value = '';
    profileTitleEl.disabled = true;
    profileAddressEl.disabled = true;
    if (profileSchemaNoteEl) {
      profileSchemaNoteEl.textContent = 'За титла и адрес изпълни SQL миграция за профилни полета.';
      profileSchemaNoteEl.classList.remove('hidden');
    }
  }
}

async function loadTeacherWeekSchedule(profile) {
  if (!teacherScheduleSectionEl || !weekScheduleBodyEl) return;

  if (profile.role !== 'teacher') {
    teacherScheduleSectionEl.classList.add('hidden');
    return;
  }

  teacherScheduleSectionEl.classList.remove('hidden');

  const today = new Date();
  const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + 7);

  const fromIso = fromDate.toISOString().slice(0, 10);
  const toIso = toDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('lessons')
    .select('id, group_id, lesson_date, topic, groups(name, teacher_id)')
    .eq('groups.teacher_id', currentSession.user.id)
    .gte('lesson_date', fromIso)
    .lte('lesson_date', toIso)
    .order('lesson_date', { ascending: true });

  if (error || !data || data.length === 0) {
    weekScheduleBodyEl.innerHTML = '<tr><td colspan="3">Няма планирани уроци за следващите 7 дни.</td></tr>';
    return;
  }

  weekScheduleBodyEl.innerHTML = data
    .map((row) => `
      <tr>
        <td>${escapeHtml(formatBgDate(row.lesson_date))}</td>
        <td>${escapeHtml(row.groups?.name ?? '-')}</td>
        <td>${escapeHtml(row.topic ?? '-')}</td>
      </tr>
    `)
    .join('');
}

async function loadTeacherPanel() {
  teacherPanelEl?.classList.remove('hidden');
  navMyHoursItem?.classList.remove('hidden');
  myHoursQuick?.classList.remove('hidden');

  const todayIso = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('lessons')
    .select('id, group_id, lesson_date, topic, groups(name, teacher_id)')
    .eq('groups.teacher_id', currentSession.user.id)
    .gte('lesson_date', todayIso)
    .order('lesson_date', { ascending: true })
    .limit(10);

  if (error || !data || data.length === 0) {
    teacherLessonsBodyEl.innerHTML = '<tr><td colspan="4">Няма предстоящи часове.</td></tr>';
    return;
  }

  teacherLessonsBodyEl.innerHTML = data
    .map((row) => `
      <tr>
        <td>${escapeHtml(formatBgDate(row.lesson_date))}</td>
        <td>${escapeHtml(row.groups?.name ?? '-')}</td>
        <td>${escapeHtml(row.topic ?? '-')}</td>
        <td><a class="btn btn-sm btn-outline-primary" href="group-details.html?groupId=${encodeURIComponent(row.group_id)}&lessonId=${encodeURIComponent(row.id)}">Отвори урок</a></td>
      </tr>
    `)
    .join('');
}

async function loadStudentPanel() {
  studentPanelEl?.classList.remove('hidden');

  const { data: groupRows } = await supabase
    .from('group_students')
    .select('group_id')
    .eq('student_id', currentSession.user.id);

  const groupIds = [...new Set((groupRows || []).map((r) => r.group_id).filter(Boolean))];
  if (groupIds.length === 0) {
    studentWeekBodyEl.innerHTML = '<tr><td colspan="3">Няма записани групи.</td></tr>';
    studentGradesBodyEl.innerHTML = '<tr><td colspan="3">Няма оценки.</td></tr>';
    studentHomeworksBodyEl.innerHTML = '<tr><td colspan="3">Няма домашни.</td></tr>';
    return;
  }

  const today = new Date();
  const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + 7);

  const [lessonsRes, gradesRes, homeworksRes] = await Promise.all([
    supabase
      .from('lessons')
      .select('lesson_date, topic, groups(name)')
      .in('group_id', groupIds)
      .gte('lesson_date', fromDate.toISOString().slice(0, 10))
      .lte('lesson_date', toDate.toISOString().slice(0, 10))
      .order('lesson_date', { ascending: true }),
    supabase
      .from('grades')
      .select('graded_on, title, grade_value')
      .eq('student_id', currentSession.user.id)
      .order('graded_on', { ascending: false })
      .limit(8),
    supabase
      .from('homeworks')
      .select('due_date, title, groups(name)')
      .in('group_id', groupIds)
      .order('due_date', { ascending: true })
      .limit(10),
  ]);

  const lessons = lessonsRes.data || [];
  const grades = gradesRes.data || [];
  const homeworks = homeworksRes.data || [];

  studentWeekBodyEl.innerHTML = lessons.length
    ? lessons
        .map((row) => `<tr><td>${escapeHtml(formatBgDate(row.lesson_date))}</td><td>${escapeHtml(row.groups?.name ?? '-')}</td><td>${escapeHtml(row.topic ?? '-')}</td></tr>`)
        .join('')
    : '<tr><td colspan="3">Няма уроци за следващите 7 дни.</td></tr>';

  studentGradesBodyEl.innerHTML = grades.length
    ? grades
        .map((row) => `<tr><td>${escapeHtml(formatBgDate(row.graded_on))}</td><td>${escapeHtml(row.title ?? '-')}</td><td>${escapeHtml(row.grade_value ?? '-')}</td></tr>`)
        .join('')
    : '<tr><td colspan="3">Няма оценки.</td></tr>';

  studentHomeworksBodyEl.innerHTML = homeworks.length
    ? homeworks
        .map((row) => `<tr><td>${escapeHtml(formatBgDate(row.due_date))}</td><td>${escapeHtml(row.title ?? '-')}</td><td>${escapeHtml(row.groups?.name ?? '-')}</td></tr>`)
        .join('')
    : '<tr><td colspan="3">Няма домашни задачи.</td></tr>';
}

async function loadParentPanel() {
  parentPanelEl?.classList.remove('hidden');

  const { data: links } = await supabase
    .from('parent_students')
    .select('student_id, profiles!parent_students_student_id_fkey(full_name)')
    .eq('parent_id', currentSession.user.id);

  const studentIds = [...new Set((links || []).map((r) => r.student_id).filter(Boolean))];
  if (studentIds.length === 0) {
    parentOverviewBodyEl.innerHTML = '<tr><td colspan="4">Няма свързани ученици.</td></tr>';
    return;
  }

  const [lessonsRes, gradesRes, homeworksRes] = await Promise.all([
    supabase
      .from('group_students')
      .select('student_id, groups(id, name), groups!inner(lessons(lesson_date, topic))')
      .in('student_id', studentIds),
    supabase
      .from('grades')
      .select('student_id, graded_on, grade_value')
      .in('student_id', studentIds)
      .order('graded_on', { ascending: false }),
    supabase
      .from('group_students')
      .select('student_id, groups!inner(homeworks(due_date, title))')
      .in('student_id', studentIds),
  ]);

  const latestGradeByStudent = new Map();
  (gradesRes.data || []).forEach((g) => {
    if (!latestGradeByStudent.has(g.student_id)) latestGradeByStudent.set(g.student_id, g);
  });

  const nextLessonByStudent = new Map();
  (lessonsRes.data || []).forEach((row) => {
    const lessons = row.groups?.lessons || [];
    const next = lessons
      .filter((l) => l.lesson_date)
      .sort((a, b) => String(a.lesson_date).localeCompare(String(b.lesson_date)))[0];
    if (next && !nextLessonByStudent.has(row.student_id)) {
      nextLessonByStudent.set(row.student_id, `${formatBgDate(next.lesson_date)} • ${next.topic || '-'}`);
    }
  });

  const nextHomeworkByStudent = new Map();
  (homeworksRes.data || []).forEach((row) => {
    const hws = row.groups?.homeworks || [];
    const next = hws
      .filter((h) => h.due_date)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
    if (next && !nextHomeworkByStudent.has(row.student_id)) {
      nextHomeworkByStudent.set(row.student_id, `${formatBgDate(next.due_date)} • ${next.title || '-'}`);
    }
  });

  parentOverviewBodyEl.innerHTML = studentIds
    .map((studentId) => {
      const studentName = (links || []).find((l) => l.student_id === studentId)?.profiles?.full_name || studentId;
      const latestGrade = latestGradeByStudent.get(studentId)?.grade_value ?? '-';
      const nextLesson = nextLessonByStudent.get(studentId) || '-';
      const nextHw = nextHomeworkByStudent.get(studentId) || '-';
      return `<tr><td>${escapeHtml(studentName)}</td><td>${escapeHtml(nextLesson)}</td><td>${escapeHtml(String(latestGrade))}</td><td>${escapeHtml(nextHw)}</td></tr>`;
    })
    .join('');
}

async function loadRolePanels(profile) {
  hideRolePanels();
  if (profile.role === 'teacher') {
    await loadTeacherPanel();
  } else if (profile.role === 'student') {
    await loadStudentPanel();
  } else if (profile.role === 'parent') {
    await loadParentPanel();
  }
}

async function hydrateProfileForm(profile) {
  profileFullNameEl.value = profile.full_name || '';
  profileEmailEl.value = currentSession.user.email || '';
  profilePhoneEl.value = profile.phone || '';
  profileAvatarUrlEl.value = profile.avatar_url || '';
  setAvatarPreview(profile.avatar_url);
  await loadExtendedProfileFields(profile.id);
}

profileAvatarUrlEl?.addEventListener('input', () => {
  setAvatarPreview(profileAvatarUrlEl.value.trim());
});

profileAvatarFileEl?.addEventListener('change', async () => {
  if (!currentSession) return;
  const file = profileAvatarFileEl.files?.[0];
  if (!file) return;

  showProfileMessage('Качване на профилна снимка...', 'warning');

  const ext = fileExtension(file.name);
  const filePath = `${currentSession.user.id}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('profile-avatars')
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    showProfileMessage(`Грешка при качване на снимка: ${uploadError.message}`);
    return;
  }

  const { data: pub } = supabase.storage.from('profile-avatars').getPublicUrl(filePath);
  const publicUrl = pub?.publicUrl || '';
  profileAvatarUrlEl.value = publicUrl;
  setAvatarPreview(publicUrl);
  showProfileMessage('Снимката е качена успешно. Натисни „Запази профила“.', 'success');
});

profileForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentSession || !currentProfile) return;

  showProfileMessage('Записване на промените...', 'warning');
  saveProfileBtn.disabled = true;

  const userId = currentSession.user.id;
  const fullName = profileFullNameEl.value.trim();
  const newEmail = profileEmailEl.value.trim().toLowerCase();
  const phone = profilePhoneEl.value.trim();
  const avatarUrl = profileAvatarUrlEl.value.trim();
  const title = profileTitleEl.value;
  const address = profileAddressEl.value.trim();

  const updatePayload = {
    full_name: fullName || currentProfile.full_name,
    phone: phone || null,
    avatar_url: avatarUrl || null,
  };

  if (hasExtendedProfileColumns) {
    updatePayload.teacher_title = title || null;
    updatePayload.address = address || null;
  }

  const { error: updateError } = await supabase.from('profiles').update(updatePayload).eq('id', userId);
  if (updateError) {
    showProfileMessage(`Грешка при запис на профил: ${updateError.message}`);
    saveProfileBtn.disabled = false;
    return;
  }

  if (newEmail && newEmail !== (currentSession.user.email || '').toLowerCase()) {
    const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
    if (emailError) {
      showProfileMessage(`Профилът е записан, но имейлът не е сменен: ${emailError.message}`);
      saveProfileBtn.disabled = false;
      return;
    }
    showProfileMessage('Профилът е записан. Изпратихме имейл за потвърждение на новия адрес.', 'success');
  } else {
    showProfileMessage('Профилът е обновен успешно.', 'success');
  }

  nameEl.textContent = updatePayload.full_name;
  saveProfileBtn.disabled = false;
});

async function loadUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  currentSession = session;

  let profile;
  try {
    profile = await ensureProfile(session);
  } catch (err) {
    nameEl.textContent = session.user.email;
    roleEl.textContent = 'Неопределена';
    showInfoNote(`Проблем при зареждане на профил: ${err.message}`);
    return;
  }

  currentProfile = profile;

  nameEl.textContent = profile.full_name || session.user.email;
  roleEl.textContent = roleLabel(profile.role);

  if (profile.role === 'parent') {
    const { data: claimedCount, error: claimError } = await supabase.rpc('claim_parent_links_for_current_user');
    if (!claimError && Number(claimedCount) > 0) {
      showInfoNote(`Автоматично свързахме ${claimedCount} ученик/ученици към родителския профил.`);
    }
  }

  if (profile.role === 'admin') {
    parentLinksBtn?.classList.remove('hidden');
    parentLinksQuick?.classList.remove('hidden');
  }

  await hydrateProfileForm(profile);
  await loadKpis();
  await loadRecentEvents();
  await loadTeacherWeekSchedule(profile);
  await loadRolePanels(profile);
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

logoutBtn?.addEventListener('click', logout);
navLogoutBtn?.addEventListener('click', logout);

loadUser();
