import { supabase } from '../lib/supabaseClient';

const nameEl = document.getElementById('user-name');
const roleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');
const parentLinksBtn = document.getElementById('parent-links-btn');
const parentLinksQuick = document.getElementById('parent-links-quick');
const kpiGroupsEl = document.getElementById('kpi-groups');
const kpiStudentsEl = document.getElementById('kpi-students');
const kpiLessonsEl = document.getElementById('kpi-lessons');
const kpiEventsEl = document.getElementById('kpi-events');
const recentEventsBody = document.getElementById('recent-events-body');

function formatBgDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('bg-BG');
}

function setSafeText(el, value) {
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

async function safeCount(tableName, filterFn) {
  try {
    let query = supabase.from(tableName).select('*', { count: 'exact', head: true });
    if (typeof filterFn === 'function') {
      query = filterFn(query);
    }
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
  if (!recentEventsBody) return;

  const today = new Date();
  const fromIso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  try {
    const { data, error } = await supabase
      .from('school_events')
      .select('id, title, starts_at, groups(name)')
      .gte('starts_at', fromIso)
      .order('starts_at', { ascending: true })
      .limit(5);

    if (error) {
      recentEventsBody.innerHTML = '<tr><td colspan="3">Събитията не са налични.</td></tr>';
      return;
    }

    if (!data || data.length === 0) {
      recentEventsBody.innerHTML = '<tr><td colspan="3">Няма предстоящи събития.</td></tr>';
      return;
    }

    recentEventsBody.innerHTML = data
      .map((ev) => `
        <tr>
          <td>${escapeHtml(formatBgDateTime(ev.starts_at))}</td>
          <td>${escapeHtml(ev.title ?? '-')}</td>
          <td>${escapeHtml(ev.groups?.name ?? 'Глобално')}</td>
        </tr>
      `)
      .join('');
  } catch {
    recentEventsBody.innerHTML = '<tr><td colspan="3">Събитията не са налични.</td></tr>';
  }
}

async function loadUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const userId = session.user.id;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', userId)
    .single();

  if (error) {
    nameEl.textContent = session.user.email;
    roleEl.textContent = 'unknown';
    return;
  }

  nameEl.textContent = profile.full_name || session.user.email;
  roleEl.textContent = profile.role;

  if (profile.role === 'admin') {
    parentLinksBtn?.classList.remove('hidden');
    parentLinksQuick?.classList.remove('hidden');
  }

  await loadKpis();
  await loadRecentEvents();
}

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
});

loadUser();


