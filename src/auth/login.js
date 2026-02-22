import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('login-form');
const msg = document.getElementById('msg');
const submitBtn = form.querySelector('button[type="submit"]');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('toggle-password');

function showMessage(text, type = 'danger') {
  msg.textContent = text;
  msg.classList.remove('text-danger', 'text-success', 'text-warning');
  if (type === 'success') msg.classList.add('text-success');
  else if (type === 'warning') msg.classList.add('text-warning');
  else msg.classList.add('text-danger');
}

function normalizeRole(role) {
  const allowed = ['teacher', 'student', 'parent'];
  return allowed.includes(role) ? role : 'student';
}

async function initLoginPage() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    window.location.href = 'dashboard.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const notice = params.get('notice');
  if (notice === 'confirm_email') {
    showMessage('Провери имейла си и потвърди регистрацията, след това влез тук.', 'success');
  }
}

initLoginPage();

if (togglePasswordBtn && passwordInput) {
  const setVisible = (visible) => {
    passwordInput.type = visible ? 'text' : 'password';
    togglePasswordBtn.innerHTML = visible ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
  };

  togglePasswordBtn.addEventListener('mouseenter', () => setVisible(true));
  togglePasswordBtn.addEventListener('mouseleave', () => setVisible(false));
  togglePasswordBtn.addEventListener('focus', () => setVisible(true));
  togglePasswordBtn.addEventListener('blur', () => setVisible(false));
  togglePasswordBtn.addEventListener('touchstart', () => setVisible(true), { passive: true });
  togglePasswordBtn.addEventListener('touchend', () => setVisible(false));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMessage('Проверка на данните...', 'warning');
  submitBtn.disabled = true;

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (!data?.session) {
      showMessage('Акаунтът не е потвърден. Провери имейла си и потвърди регистрацията.', 'warning');
      return;
    }

    const userId = data.session.user.id;
    const metaRole = normalizeRole(data.session.user.user_metadata?.role);
    const metaName = data.session.user.user_metadata?.full_name || '';

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', userId)
      .maybeSingle();

    const needsNameSync = !profileRow || (!profileRow.full_name && !!metaName);
    if (!profileRow) {
      await supabase.from('profiles').upsert(
        {
          id: userId,
          role: metaRole,
          full_name: metaName || 'Потребител',
        },
        { onConflict: 'id' }
      );
    } else if (needsNameSync) {
      await supabase.from('profiles').update({ full_name: metaName }).eq('id', userId);
    }

    showMessage('Успешен вход. Пренасочване...', 'success');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 500);
  } catch (err) {
    if (String(err?.message || '').toLowerCase().includes('email not confirmed')) {
      showMessage('Имейлът не е потвърден. Отвори линка от пощата си и опитай отново.', 'warning');
    } else {
      showMessage(`Грешка при вход: ${err.message}`);
    }
  } finally {
    submitBtn.disabled = false;
  }
});



