import { supabase } from '../lib/supabaseClient';

const msgEl = document.getElementById('msg');
const formEl = document.getElementById('create-link-form');
const parentSelect = document.getElementById('parent-id');
const studentSelect = document.getElementById('student-id');
const bodyEl = document.getElementById('links-body');
const logoutBtn = document.getElementById('logout-btn');
const kpiParentsEl = document.getElementById('kpi-pl-parents');
const kpiStudentsEl = document.getElementById('kpi-pl-students');
const kpiLinksEl = document.getElementById('kpi-pl-links');

let parents = [];
let students = [];

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

function optionLabel(profile) {
  const name = profile.full_name || profile.id;
  return `${name} (${profile.id})`;
}

async function requireAdmin() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    window.location.href = 'login.html';
    return false;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (error) {
    showMessage(`Грешка при профил: ${error.message}`);
    return false;
  }

  if (profile.role !== 'admin') {
    showMessage('Нямаш достъп до тази страница.');
    return false;
  }

  return true;
}

async function loadProfiles() {
  const [{ data: parentRows, error: parentError }, { data: studentRows, error: studentError }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'parent').order('full_name'),
    supabase.from('profiles').select('id, full_name').eq('role', 'student').order('full_name'),
  ]);

  if (parentError) {
    showMessage(`Грешка при родители: ${parentError.message}`);
    return false;
  }

  if (studentError) {
    showMessage(`Грешка при ученици: ${studentError.message}`);
    return false;
  }

  parents = parentRows || [];
  students = studentRows || [];
  setKpiText(kpiParentsEl, String(parents.length));
  setKpiText(kpiStudentsEl, String(students.length));

  if (parents.length === 0) {
    parentSelect.innerHTML = '<option value="">Няма родители</option>';
  } else {
    parentSelect.innerHTML = parents
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(optionLabel(p))}</option>`)
      .join('');
  }

  if (students.length === 0) {
    studentSelect.innerHTML = '<option value="">Няма ученици</option>';
  } else {
    studentSelect.innerHTML = students
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(optionLabel(s))}</option>`)
      .join('');
  }

  return true;
}

function findProfileName(rows, id) {
  const p = rows.find((x) => x.id === id);
  return p ? p.full_name || p.id : id;
}

async function loadLinks() {
  const { data, error } = await supabase
    .from('parent_students')
    .select('id, parent_id, student_id, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    showMessage(`Грешка при връзките: ${error.message}`);
    setKpiText(kpiLinksEl, '-');
    return;
  }

  if (!data || data.length === 0) {
    bodyEl.innerHTML = '<tr><td colspan="4" class="elite-empty"><i class="bi bi-inbox"></i>Няма създадени връзки.</td></tr>';
    setKpiText(kpiLinksEl, '0');
    return;
  }

  setKpiText(kpiLinksEl, String(data.length));

  bodyEl.innerHTML = data
    .map((row) => `
      <tr>
        <td>${escapeHtml(findProfileName(parents, row.parent_id))}</td>
        <td>${escapeHtml(findProfileName(students, row.student_id))}</td>
        <td>${escapeHtml(new Date(row.created_at).toLocaleString('bg-BG'))}</td>
        <td><button class="btn danger js-remove" data-id="${escapeHtml(row.id)}">Премахни</button></td>
      </tr>
    `)
    .join('');

  bodyEl.querySelectorAll('.js-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await removeLink(id);
    });
  });
}

async function removeLink(id) {
  showMessage('Премахваме връзката...');

  const { error } = await supabase
    .from('parent_students')
    .delete()
    .eq('id', id);

  if (error) {
    showMessage(`Грешка при премахване: ${error.message}`);
    return;
  }

  showMessage('Връзката е премахната.');
  await loadLinks();
}

formEl?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const parentId = parentSelect.value;
  const studentId = studentSelect.value;

  if (!parentId || !studentId) {
    showMessage('Избери родител и ученик.');
    return;
  }

  showMessage('Добавяме връзката...');

  const { error } = await supabase
    .from('parent_students')
    .insert({ parent_id: parentId, student_id: studentId });

  if (error) {
    showMessage(`Грешка при добавяне: ${error.message}`);
    return;
  }

  showMessage('Връзката е добавена успешно.');
  await loadLinks();
});

logoutBtn?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
});

(async function init() {
  const ok = await requireAdmin();
  if (!ok) return;

  const loaded = await loadProfiles();
  if (!loaded) return;

  await loadLinks();
})();



