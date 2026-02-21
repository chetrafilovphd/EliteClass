import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const bodyEl = document.getElementById('groups-body');
const createSection = document.getElementById('create-section');
const createForm = document.getElementById('create-group-form');
const logoutBtn = document.getElementById('logout-btn');
const kpiGroupsVisibleEl = document.getElementById('kpi-groups-visible');
const kpiGroupsRoleEl = document.getElementById('kpi-groups-role');
const kpiGroupsCreateEl = document.getElementById('kpi-groups-create');

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
  if (kpiGroupsRoleEl) {
    kpiGroupsRoleEl.innerHTML = `<span class="elite-badge-soft ${roleBadgeClass(currentRole)}">${escapeHtml(roleLabel(currentRole))}</span>`;
  }
  setKpiText(kpiGroupsCreateEl, currentRole === 'admin' || currentRole === 'teacher' ? 'Разрешено' : 'Само преглед');

  if (currentRole === 'admin' || currentRole === 'teacher') {
    createSection.classList.remove('hidden');
  }

  return true;
}

async function getStudentGroupIds(studentId) {
  const { data, error } = await supabase
    .from('group_students')
    .select('group_id')
    .eq('student_id', studentId);

  if (error) {
    showMessage(`Грешка при групите на ученик: ${error.message}`);
    return null;
  }

  return [...new Set((data || []).map((row) => row.group_id).filter(Boolean))];
}

async function getParentGroupIds(parentId) {
  const { data: links, error: linksError } = await supabase
    .from('parent_students')
    .select('student_id')
    .eq('parent_id', parentId);

  if (linksError) {
    showMessage(`Грешка при връзка родител-ученик: ${linksError.message}`);
    return null;
  }

  const studentIds = [...new Set((links || []).map((row) => row.student_id).filter(Boolean))];
  if (studentIds.length === 0) return [];

  const { data: rows, error: rowsError } = await supabase
    .from('group_students')
    .select('group_id')
    .in('student_id', studentIds);

  if (rowsError) {
    showMessage(`Грешка при групите на родителя: ${rowsError.message}`);
    return null;
  }

  return [...new Set((rows || []).map((row) => row.group_id).filter(Boolean))];
}

async function loadGroups() {
  let query = supabase
    .from('groups')
    .select('id, name, language, level, teacher_id')
    .order('created_at', { ascending: false });

  if (currentRole === 'teacher') {
    query = query.or(`teacher_id.eq.${currentUser.id},created_by.eq.${currentUser.id}`);
  } else if (currentRole === 'student') {
    const ids = await getStudentGroupIds(currentUser.id);
    if (ids === null) return;
    if (ids.length === 0) {
      bodyEl.innerHTML = '<tr><td colspan="5" class="elite-empty"><i class="bi bi-inbox"></i>Нямаш записани групи.</td></tr>';
      setKpiText(kpiGroupsVisibleEl, '0');
      return;
    }
    query = query.in('id', ids);
  } else if (currentRole === 'parent') {
    const ids = await getParentGroupIds(currentUser.id);
    if (ids === null) return;
    if (ids.length === 0) {
      bodyEl.innerHTML = '<tr><td colspan="5" class="elite-empty"><i class="bi bi-inbox"></i>Няма групи за свързаните ученици.</td></tr>';
      setKpiText(kpiGroupsVisibleEl, '0');
      return;
    }
    query = query.in('id', ids);
  } else if (currentRole !== 'admin') {
    bodyEl.innerHTML = '<tr><td colspan="5" class="elite-empty"><i class="bi bi-shield-lock"></i>Нямаш достъп до групите.</td></tr>';
    setKpiText(kpiGroupsVisibleEl, '0');
    return;
  }

  const { data, error } = await query;

  if (error) {
    showMessage(`Грешка при зареждане: ${error.message}`);
    setKpiText(kpiGroupsVisibleEl, '-');
    return;
  }

  if (!data || data.length === 0) {
    bodyEl.innerHTML = '<tr><td colspan="5" class="elite-empty"><i class="bi bi-inbox"></i>Все още няма групи.</td></tr>';
    setKpiText(kpiGroupsVisibleEl, '0');
    return;
  }

  setKpiText(kpiGroupsVisibleEl, String(data.length));

  bodyEl.innerHTML = data
    .map((g) => `
      <tr>
        <td>${escapeHtml(g.name)}</td>
        <td>${escapeHtml(g.language)}</td>
        <td>${escapeHtml(g.level)}</td>
        <td>${escapeHtml(g.teacher_id ?? '-')}</td>
        <td><a class="btn" href="group-details.html?groupId=${encodeURIComponent(g.id)}">Отвори</a></td>
      </tr>
    `)
    .join('');
}

createForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('group-name').value.trim();
  const language = document.getElementById('group-language').value.trim();
  const level = document.getElementById('group-level').value.trim();

  if (!name || !language || !level) {
    showMessage('Попълни всички полета.');
    return;
  }

  if (!(currentRole === 'admin' || currentRole === 'teacher')) {
    showMessage('Нямаш права да създаваш групи.');
    return;
  }

  showMessage('Записваме...');

  const payload = {
    name,
    language,
    level,
    created_by: currentUser.id,
    teacher_id: currentRole === 'teacher' ? currentUser.id : null,
  };

  const { error } = await supabase.from('groups').insert(payload);

  if (error) {
    showMessage(`Грешка при създаване: ${error.message}`);
    return;
  }

  createForm.reset();
  showMessage('Групата е създадена успешно.');
  await loadGroups();
});

logoutBtn?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
});

(async function init() {
  const ok = await requireAuth();
  if (!ok) return;
  await loadGroups();
})();



