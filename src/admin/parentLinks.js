import { supabase } from '../lib/supabaseClient.js';

const msgEl = document.getElementById('msg');
const formEl = document.getElementById('create-link-form');
const inviteFormEl = document.getElementById('create-invite-form');
const parentSelect = document.getElementById('parent-id');
const studentSelect = document.getElementById('student-id');
const inviteParentEmailInput = document.getElementById('invite-parent-email');
const inviteStudentSelect = document.getElementById('invite-student-id');
const bodyEl = document.getElementById('links-body');
const invitesBodyEl = document.getElementById('invites-body');
const usersBodyEl = document.getElementById('users-body');
const logoutBtn = document.getElementById('logout-btn');
const navLogoutBtn = document.getElementById('nav-logout-btn');
const kpiParentsEl = document.getElementById('kpi-pl-parents');
const kpiStudentsEl = document.getElementById('kpi-pl-students');
const kpiLinksEl = document.getElementById('kpi-pl-links');

let parents = [];
let students = [];
let currentUser = null;

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

  currentUser = session.user;
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
    if (inviteStudentSelect) inviteStudentSelect.innerHTML = '<option value="">Няма ученици</option>';
  } else {
    const optionsHtml = students
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(optionLabel(s))}</option>`)
      .join('');

    studentSelect.innerHTML = optionsHtml;
    if (inviteStudentSelect) inviteStudentSelect.innerHTML = optionsHtml;
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

function inviteStatusLabel(invite) {
  if (invite.claimed_at) return 'Активирана';
  return 'Чака регистрация/вход';
}

function roleOptionsHtml(currentRole) {
  const roles = ['admin', 'teacher', 'student', 'parent'];
  return roles
    .map((role) => `<option value="${role}" ${currentRole === role ? 'selected' : ''}>${role}</option>`)
    .join('');
}

function titleOptionsHtml(currentTitle) {
  const items = ['', 'г-н', 'г-жа', 'д-р'];
  return items
    .map((title) => `<option value="${title}" ${currentTitle === title ? 'selected' : ''}>${title || 'Без титла'}</option>`)
    .join('');
}

function findInputValue(rowId, cls) {
  const el = Array.from(usersBodyEl.querySelectorAll(`.${cls}`)).find((x) => x.getAttribute('data-id') === rowId);
  return el ? el.value : '';
}

function buildResetRedirect() {
  const basePath = window.location.pathname.replace(/[^/]*$/, '');
  return `${window.location.origin}${basePath}reset-password.html`;
}

async function loadUsers() {
  if (!usersBodyEl) return;

  const { data, error } = await supabase.rpc('admin_list_users');

  if (error) {
    usersBodyEl.innerHTML = `<tr><td colspan="7" class="elite-empty"><i class="bi bi-exclamation-triangle"></i>Грешка при зареждане на потребители: ${escapeHtml(error.message)}. Изпълни SQL файла <code>supabase/admin_user_tools.sql</code>.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    usersBodyEl.innerHTML = '<tr><td colspan="7" class="elite-empty"><i class="bi bi-inbox"></i>Няма потребители.</td></tr>';
    return;
  }

  usersBodyEl.innerHTML = data
    .map(
      (row) => `
      <tr>
        <td><input class="form-control form-control-sm js-name-input" data-id="${escapeHtml(row.id)}" value="${escapeHtml(row.full_name || '')}" /></td>
        <td>${escapeHtml(row.email || '-')}</td>
        <td>
          <select class="form-select form-select-sm js-role-select" data-id="${escapeHtml(row.id)}">
            ${roleOptionsHtml(row.role)}
          </select>
        </td>
        <td><input class="form-control form-control-sm js-phone-input" data-id="${escapeHtml(row.id)}" value="${escapeHtml(row.phone || '')}" /></td>
        <td>
          <select class="form-select form-select-sm js-title-select" data-id="${escapeHtml(row.id)}">
            ${titleOptionsHtml(row.teacher_title || '')}
          </select>
        </td>
        <td><input class="form-control form-control-sm js-address-input" data-id="${escapeHtml(row.id)}" value="${escapeHtml(row.address || '')}" /></td>
        <td>
          <div class="d-flex flex-wrap gap-1">
            <button class="btn btn-sm btn-primary js-save-user" data-id="${escapeHtml(row.id)}">Запази</button>
            <button class="btn btn-sm btn-outline-secondary js-reset-pass" data-email="${escapeHtml(row.email || '')}">Рестарт парола</button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  usersBodyEl.querySelectorAll('.js-save-user').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = btn.getAttribute('data-id');
      const role = findInputValue(userId, 'js-role-select');
      const fullName = findInputValue(userId, 'js-name-input');
      const phone = findInputValue(userId, 'js-phone-input');
      const teacherTitle = findInputValue(userId, 'js-title-select');
      const address = findInputValue(userId, 'js-address-input');

      if (!role) return;

      showMessage('Записваме профила...');

      const { error: updateError } = await supabase.from('profiles').update({
        role,
        full_name: fullName || null,
        phone: phone || null,
        teacher_title: teacherTitle || null,
        address: address || null,
      })
        .eq('id', userId);

      if (updateError) {
        showMessage(`Грешка при запис на профил: ${updateError.message}`);
        return;
      }

      showMessage('Профилът е обновен успешно.');
      await loadProfiles();
      await loadUsers();
    });
  });

  usersBodyEl.querySelectorAll('.js-reset-pass').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email');
      if (!email) {
        showMessage('Липсва имейл за този профил.');
        return;
      }

      showMessage('Изпращаме имейл за смяна на парола...');
      const redirectTo = buildResetRedirect();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) {
        showMessage(`Грешка при изпращане: ${resetError.message}`);
        return;
      }

      showMessage(`Изпратен е линк за смяна на парола към ${email}.`);
    });
  });
}

async function loadInvites() {
  if (!invitesBodyEl) return;

  const { data, error } = await supabase
    .from('parent_student_invites')
    .select('id, parent_email, student_id, created_at, claimed_at')
    .order('created_at', { ascending: false });

  if (error) {
    invitesBodyEl.innerHTML = `
      <tr>
        <td colspan="5" class="elite-empty"><i class="bi bi-exclamation-triangle"></i>
          Липсва таблица за покани. Изпълни SQL файла <code>supabase/parent_invites.sql</code>.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    invitesBodyEl.innerHTML = '<tr><td colspan="5" class="elite-empty"><i class="bi bi-inbox"></i>Няма създадени покани.</td></tr>';
    return;
  }

  invitesBodyEl.innerHTML = data
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.parent_email)}</td>
        <td>${escapeHtml(findProfileName(students, row.student_id))}</td>
        <td>${escapeHtml(new Date(row.created_at).toLocaleString('bg-BG'))}</td>
        <td>${escapeHtml(inviteStatusLabel(row))}</td>
        <td>
          ${row.claimed_at ? '-' : `<button class="btn danger js-remove-invite" data-id="${escapeHtml(row.id)}">Премахни</button>`}
        </td>
      </tr>
    `)
    .join('');

  invitesBodyEl.querySelectorAll('.js-remove-invite').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await removeInvite(id);
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

async function removeInvite(id) {
  showMessage('Премахваме поканата...');

  const { error } = await supabase
    .from('parent_student_invites')
    .delete()
    .eq('id', id);

  if (error) {
    showMessage(`Грешка при премахване на покана: ${error.message}`);
    return;
  }

  showMessage('Поканата е премахната.');
  await loadInvites();
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

inviteFormEl?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const parentEmail = inviteParentEmailInput.value.trim().toLowerCase();
  const studentId = inviteStudentSelect.value;

  if (!parentEmail || !studentId) {
    showMessage('Въведи имейл и избери ученик.');
    return;
  }

  showMessage('Създаваме покана...');

  const { error } = await supabase
    .from('parent_student_invites')
    .insert({
      parent_email: parentEmail,
      student_id: studentId,
      created_by: currentUser.id,
    });

  if (error) {
    showMessage(`Грешка при покана: ${error.message}`);
    return;
  }

  showMessage('Поканата е създадена. При регистрация/вход с този имейл връзката ще се активира автоматично.');
  inviteFormEl.reset();
  await loadInvites();
});

async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

logoutBtn?.addEventListener('click', logout);
navLogoutBtn?.addEventListener('click', logout);

(async function init() {
  const ok = await requireAdmin();
  if (!ok) return;

  const loaded = await loadProfiles();
  if (!loaded) return;

  await loadLinks();
  await loadInvites();
  await loadUsers();
})();
