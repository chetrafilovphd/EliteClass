import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const manageSection = document.getElementById('manage-section');
const createForm = document.getElementById('create-event-form');
const titleInput = document.getElementById('event-title');
const groupSelect = document.getElementById('event-group-id');
const startInput = document.getElementById('event-start');
const endInput = document.getElementById('event-end');
const descriptionInput = document.getElementById('event-description');
const fromDateInput = document.getElementById('from-date');
const toDateInput = document.getElementById('to-date');
const reloadBtn = document.getElementById('reload-btn');
const eventsBody = document.getElementById('events-body');
const logoutBtn = document.getElementById('logout-btn');
const navLogoutBtn = document.getElementById('nav-logout-btn');
const kpiCalTotalEl = document.getElementById('kpi-cal-total');
const kpiCalWeekEl = document.getElementById('kpi-cal-week');
const kpiCalGlobalEl = document.getElementById('kpi-cal-global');
const kpiCalRoleEl = document.getElementById('kpi-cal-role');

let currentUser = null;
let currentRole = null;

function showMessage(text) {
  msgEl.textContent = text;
}

function setKpiText(el, value) {
  if (!el) return;
  el.textContent = value;
}

function roleLabel(role) {
  if (role === 'admin') return 'Админ';
  if (role === 'teacher') return 'Учител';
  if (role === 'student') return 'Ученик';
  if (role === 'parent') return 'Родител';
  return role || '-';
}

function roleBadgeClass(role) {
  if (role === 'admin') return 'elite-badge-admin';
  if (role === 'teacher') return 'elite-badge-teacher';
  if (role === 'student') return 'elite-badge-student';
  if (role === 'parent') return 'elite-badge-parent';
  return '';
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

function toIsoFromDatetimeLocal(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function startOfTodayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function plusDaysIsoLocal(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateTime(value) {
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
  }

  if (kpiCalRoleEl) {
    kpiCalRoleEl.innerHTML = `<span class="elite-badge-soft ${roleBadgeClass(currentRole)}">${escapeHtml(roleLabel(currentRole))}</span>`;
  }

  return true;
}

async function loadManagedGroups() {
  if (!canManage()) {
    groupSelect.innerHTML = '<option value="">Група (нямаш права за създаване)</option>';
    return;
  }

  let query = supabase.from('groups').select('id, name').order('name');
  if (currentRole === 'teacher') {
    query = query.or(`teacher_id.eq.${currentUser.id},created_by.eq.${currentUser.id}`);
  }

  const { data, error } = await query;

  if (error) {
    showMessage(`Грешка при групите: ${error.message}`);
    groupSelect.innerHTML = '<option value="">Грешка при групите</option>';
    return;
  }

  const options = [];
  if (currentRole === 'admin') {
    options.push('<option value="">Всички групи (глобално събитие)</option>');
  } else {
    options.push('<option value="">Избери група</option>');
  }

  for (const g of data || []) {
    options.push(`<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`);
  }

  groupSelect.innerHTML = options.join('');
}

function canDeleteEvent(eventRow) {
  if (currentRole === 'admin') return true;
  if (currentRole === 'teacher') {
    return eventRow.created_by === currentUser.id;
  }
  return false;
}

async function loadEvents() {
  const fromDate = fromDateInput.value;
  const toDate = toDateInput.value;

  let query = supabase
    .from('school_events')
    .select('id, group_id, title, description, starts_at, ends_at, created_by, groups(name)')
    .order('starts_at', { ascending: true });

  if (fromDate) {
    query = query.gte('starts_at', `${fromDate}T00:00:00`);
  }
  if (toDate) {
    query = query.lte('starts_at', `${toDate}T23:59:59`);
  }

  const { data, error } = await query;

  if (error) {
    showMessage(`Грешка при зареждане на събития: ${error.message}`);
    setKpiText(kpiCalTotalEl, '-');
    setKpiText(kpiCalWeekEl, '-');
    setKpiText(kpiCalGlobalEl, '-');
    return;
  }

  if (!data || data.length === 0) {
    eventsBody.innerHTML = '<tr><td colspan="7" class="elite-empty"><i class="bi bi-inbox"></i>Няма събития за избрания период.</td></tr>';
    setKpiText(kpiCalTotalEl, '0');
    setKpiText(kpiCalWeekEl, '0');
    setKpiText(kpiCalGlobalEl, '0');
    return;
  }

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const inNextWeek = data.filter((row) => {
    const t = new Date(row.starts_at).getTime();
    return !Number.isNaN(t) && t >= now && t <= now + weekMs;
  }).length;
  const globalCount = data.filter((row) => !row.group_id).length;

  setKpiText(kpiCalTotalEl, String(data.length));
  setKpiText(kpiCalWeekEl, String(inNextWeek));
  setKpiText(kpiCalGlobalEl, String(globalCount));

  eventsBody.innerHTML = data
    .map((row) => {
      const groupName = row.groups?.name || 'Глобално';
      const deleteBtn = canDeleteEvent(row)
        ? `<button class="btn danger js-delete" data-id="${escapeHtml(row.id)}">Изтрий</button>`
        : '-';

      return `
        <tr>
          <td class="nowrap">${formatDateTime(row.starts_at)}</td>
          <td class="nowrap">${formatDateTime(row.ends_at)}</td>
          <td>${escapeHtml(row.title)}</td>
          <td>${escapeHtml(groupName)}</td>
          <td>${escapeHtml(row.description ?? '-')}</td>
          <td>${escapeHtml(row.created_by)}</td>
          <td>${deleteBtn}</td>
        </tr>
      `;
    })
    .join('');

  eventsBody.querySelectorAll('.js-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await deleteEvent(id);
    });
  });
}

async function deleteEvent(eventId) {
  if (!eventId) return;
  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  showMessage('Изтриваме събитието...');

  const { error } = await supabase
    .from('school_events')
    .delete()
    .eq('id', eventId);

  if (error) {
    showMessage(`Грешка при изтриване: ${error.message}`);
    return;
  }

  showMessage('Събитието е изтрито.');
  await loadEvents();
}

createForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!canManage()) {
    showMessage('Нямаш права за това действие.');
    return;
  }

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const groupId = groupSelect.value || null;
  const startsAt = toIsoFromDatetimeLocal(startInput.value);
  const endsAt = toIsoFromDatetimeLocal(endInput.value);

  if (!title || !startsAt) {
    showMessage('Попълни заглавие и начало.');
    return;
  }

  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    showMessage('Краят не може да е преди началото.');
    return;
  }

  if (currentRole === 'teacher' && !groupId) {
    showMessage('Учител може да създава събития само за конкретна група.');
    return;
  }

  showMessage('Записваме събитието...');

  const { error } = await supabase
    .from('school_events')
    .insert({
      group_id: groupId,
      title,
      description: description || null,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: currentUser.id,
    });

  if (error) {
    showMessage(`Грешка при създаване: ${error.message}`);
    return;
  }

  createForm.reset();
  groupSelect.value = '';
  showMessage('Събитието е добавено успешно.');
  await loadEvents();
});

reloadBtn?.addEventListener('click', async () => {
  await loadEvents();
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

  fromDateInput.value = startOfTodayIsoLocal();
  toDateInput.value = plusDaysIsoLocal(60);

  await loadManagedGroups();
  await loadEvents();
})();




