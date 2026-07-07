import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const bodyEl = document.getElementById('schedule-body');
const createSection = document.getElementById('create-section');
const createForm = document.getElementById('create-slot-form');
const slotGroupSelect = document.getElementById('slot-group');
const slotDaySelect = document.getElementById('slot-day');
const slotStartInput = document.getElementById('slot-start');
const slotEndInput = document.getElementById('slot-end');
const slotRoomInput = document.getElementById('slot-room');
const filterGroupSelect = document.getElementById('filter-group');
const logoutBtn = document.getElementById('logout-btn');
const navLogoutBtn = document.getElementById('nav-logout-btn');
const kpiSlotsTotalEl = document.getElementById('kpi-slots-total');
const kpiRoleEl = document.getElementById('kpi-role');
const kpiCreateEl = document.getElementById('kpi-create');
const kpiFilterEl = document.getElementById('kpi-filter');

const DAY_NAMES = {
  1: 'Понеделник',
  2: 'Вторник',
  3: 'Сряда',
  4: 'Четвъртък',
  5: 'Петък',
  6: 'Събота',
  7: 'Неделя',
};

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

// "09:00:00" -> "09:00"
function formatTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

// Only the admin builds the weekly schedule. Teachers/students/parents view it.
function canManage() {
  return currentRole === 'admin';
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
  if (kpiRoleEl) {
    kpiRoleEl.innerHTML = `<span class="elite-badge-soft ${roleBadgeClass(currentRole)}">${escapeHtml(roleLabel(currentRole))}</span>`;
  }
  setKpiText(kpiCreateEl, canManage() ? 'Разрешено' : 'Само преглед');

  if (canManage()) {
    createSection.classList.remove('hidden');
  }

  return true;
}

// Groups the current user can manage (for the create form). Admin sees all.
async function loadManageableGroups() {
  let query = supabase.from('groups').select('id, name').order('name');
  if (currentRole === 'teacher') {
    query = query.or(`teacher_id.eq.${currentUser.id},created_by.eq.${currentUser.id}`);
  }

  const { data, error } = await query;
  if (error) {
    showMessage(`Грешка при зареждане на групи: ${error.message}`);
    return;
  }

  slotGroupSelect.innerHTML = (data || [])
    .map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`)
    .join('');
}

// All groups visible to the user (RLS-filtered) for the filter dropdown.
async function loadFilterGroups() {
  const { data, error } = await supabase.from('groups').select('id, name').order('name');
  if (error) return;

  const options = ['<option value="">Всички групи</option>']
    .concat((data || []).map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`));
  filterGroupSelect.innerHTML = options.join('');
}

function renderEmpty(message) {
  bodyEl.innerHTML = `<div class="elite-empty"><i class="bi bi-inbox"></i>${escapeHtml(message)}</div>`;
}

async function loadSlots() {
  const filterGroupId = filterGroupSelect.value;
  setKpiText(kpiFilterEl, filterGroupId
    ? filterGroupSelect.options[filterGroupSelect.selectedIndex]?.text || 'Група'
    : 'Всички групи');

  let query = supabase
    .from('schedule_slots')
    .select('id, group_id, day_of_week, start_time, end_time, room, groups(name)')
    .order('day_of_week')
    .order('start_time');

  if (filterGroupId) {
    query = query.eq('group_id', filterGroupId);
  }

  const { data, error } = await query;
  if (error) {
    showMessage(`Грешка при зареждане на разписанието: ${error.message}`);
    renderEmpty('Разписанието не може да бъде заредено.');
    setKpiText(kpiSlotsTotalEl, '0');
    return;
  }

  const slots = data || [];
  setKpiText(kpiSlotsTotalEl, String(slots.length));

  if (slots.length === 0) {
    renderEmpty('Няма въведени часове в разписанието.');
    return;
  }

  const byDay = new Map();
  for (const slot of slots) {
    if (!byDay.has(slot.day_of_week)) byDay.set(slot.day_of_week, []);
    byDay.get(slot.day_of_week).push(slot);
  }

  const dayCards = [];
  for (let day = 1; day <= 7; day += 1) {
    const daySlots = byDay.get(day);
    if (!daySlots || daySlots.length === 0) continue;

    const rows = daySlots
      .map((slot) => {
        const time = `${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`;
        const room = slot.room ? `<span class="elite-muted"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(slot.room)}</span>` : '';
        const del = canManage()
          ? `<button class="btn btn-sm btn-outline-danger js-del-slot" data-id="${escapeHtml(slot.id)}" title="Изтрий"><i class="bi bi-trash"></i></button>`
          : '';
        return `
          <tr>
            <td class="fw-semibold text-nowrap">${escapeHtml(time)}</td>
            <td>${escapeHtml(slot.groups?.name || '-')}</td>
            <td>${room}</td>
            <td class="text-end">${del}</td>
          </tr>`;
      })
      .join('');

    dayCards.push(`
      <div class="card border-0 bg-light mb-3">
        <div class="card-body">
          <h2 class="h6 mb-3"><i class="bi bi-calendar-day me-2"></i>${escapeHtml(DAY_NAMES[day])}</h2>
          <div class="table-responsive">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th><i class="bi bi-clock me-1"></i>Час</th>
                  <th><i class="bi bi-people me-1"></i>Група</th>
                  <th><i class="bi bi-geo-alt me-1"></i>Зала</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`);
  }

  bodyEl.innerHTML = dayCards.join('');

  bodyEl.querySelectorAll('.js-del-slot').forEach((btn) => {
    btn.addEventListener('click', () => deleteSlot(btn.getAttribute('data-id')));
  });
}

async function deleteSlot(slotId) {
  if (!slotId || !canManage()) return;
  showMessage('Изтриваме...');
  const { error } = await supabase.from('schedule_slots').delete().eq('id', slotId);
  if (error) {
    showMessage(`Грешка при изтриване: ${error.message}`);
    return;
  }
  showMessage('Часът е изтрит.');
  await loadSlots();
}

createForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!canManage()) {
    showMessage('Нямаш права да създаваш часове.');
    return;
  }

  const groupId = slotGroupSelect.value;
  const dayOfWeek = Number(slotDaySelect.value);
  const startTime = slotStartInput.value;
  const endTime = slotEndInput.value;
  const room = slotRoomInput.value.trim();

  if (!groupId || !dayOfWeek || !startTime || !endTime) {
    showMessage('Попълни група, ден, начало и край.');
    return;
  }

  if (endTime <= startTime) {
    showMessage('Краят трябва да е след началото.');
    return;
  }

  showMessage('Записваме...');

  const { error } = await supabase.from('schedule_slots').insert({
    group_id: groupId,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    room: room || null,
    created_by: currentUser.id,
  });

  if (error) {
    showMessage(`Грешка при създаване: ${error.message}`);
    return;
  }

  createForm.reset();
  showMessage('Часът е добавен в разписанието.');
  await loadSlots();
});

filterGroupSelect?.addEventListener('change', loadSlots);

async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

logoutBtn?.addEventListener('click', logout);
navLogoutBtn?.addEventListener('click', logout);

(async function init() {
  const ok = await requireAuth();
  if (!ok) return;

  if (canManage()) {
    await loadManageableGroups();
  }
  await loadFilterGroups();
  await loadSlots();
})();
