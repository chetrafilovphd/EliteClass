import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const subtitleEl = document.getElementById('hours-subtitle');
const bodyEl = document.getElementById('my-hours-body');
const kpiTodayEl = document.getElementById('kpi-hours-today');
const kpiWeekEl = document.getElementById('kpi-hours-week');
const kpiTotalEl = document.getElementById('kpi-hours-total');
const kpiRoleEl = document.getElementById('kpi-hours-role');
const logoutBtn = document.getElementById('logout-btn');
const navLogoutBtn = document.getElementById('nav-logout-btn');

let currentUser = null;
let currentRole = null;

function setKpi(el, value) {
  if (el) el.textContent = value;
}

function showMessage(text) {
  if (msgEl) msgEl.textContent = text;
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

function formatBgDate(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString('bg-BG');
}

function todayIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
}

function plusDaysIso(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
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
    .select('role, full_name')
    .eq('id', currentUser.id)
    .single();

  if (error) {
    showMessage(`Грешка при профил: ${error.message}`);
    return false;
  }

  currentRole = profile.role;
  setKpi(kpiRoleEl, roleLabel(currentRole));
  subtitleEl.textContent = `Потребител: ${profile.full_name || currentUser.email}`;

  if (currentRole !== 'teacher' && currentRole !== 'admin') {
    bodyEl.innerHTML = '<tr><td colspan="5">Тази секция е достъпна само за учител или администратор.</td></tr>';
    return false;
  }

  return true;
}

async function loadHours() {
  const from = todayIso();
  const to = plusDaysIso(14);

  let query = supabase
    .from('lessons')
    .select('id, group_id, lesson_date, topic, notes, groups(name, teacher_id)')
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .order('lesson_date', { ascending: true });

  if (currentRole === 'teacher') {
    query = query.eq('groups.teacher_id', currentUser.id);
  }

  const { data, error } = await query;
  if (error) {
    showMessage(`Грешка при часовете: ${error.message}`);
    setKpi(kpiTodayEl, '-');
    setKpi(kpiWeekEl, '-');
    setKpi(kpiTotalEl, '-');
    return;
  }

  const rows = data || [];
  const today = todayIso();
  const weekTo = plusDaysIso(7);
  const todayCount = rows.filter((r) => r.lesson_date === today).length;
  const weekCount = rows.filter((r) => r.lesson_date >= today && r.lesson_date <= weekTo).length;

  setKpi(kpiTodayEl, String(todayCount));
  setKpi(kpiWeekEl, String(weekCount));
  setKpi(kpiTotalEl, String(rows.length));

  if (!rows.length) {
    bodyEl.innerHTML = '<tr><td colspan="5">Няма планирани часове в следващите 14 дни.</td></tr>';
    return;
  }

  bodyEl.innerHTML = rows
    .map((row) => {
      const actionUrl = `group-details.html?groupId=${encodeURIComponent(row.group_id)}&lessonId=${encodeURIComponent(row.id)}`;
      return `
        <tr>
          <td>${escapeHtml(formatBgDate(row.lesson_date))}</td>
          <td>${escapeHtml(row.groups?.name ?? '-')}</td>
          <td>${escapeHtml(row.topic ?? '-')}</td>
          <td>${escapeHtml(row.notes ?? '-')}</td>
          <td><a class="btn btn-sm btn-outline-primary" href="${actionUrl}">Вземи часа</a></td>
        </tr>
      `;
    })
    .join('');
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

logoutBtn?.addEventListener('click', logout);
navLogoutBtn?.addEventListener('click', logout);

(async function init() {
  const ok = await requireAuth();
  if (!ok) return;
  await loadHours();
})();
