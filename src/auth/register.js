import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('register-form');
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

function isStrongPassword(password) {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  return password.length >= 8 && hasUpper && hasLower && hasNumber && hasSymbol;
}

function normalizeRole(role) {
  const allowed = ['teacher', 'student', 'parent'];
  return allowed.includes(role) ? role : 'student';
}

async function redirectIfLoggedIn() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    window.location.href = 'dashboard.html';
  }
}

redirectIfLoggedIn();

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
  showMessage('Създаване на акаунт...', 'warning');
  submitBtn.disabled = true;

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const role = normalizeRole(document.getElementById('role').value);

  if (!isStrongPassword(password)) {
    showMessage('Слаба парола. Използвай главна и малка буква, цифра и символ.');
    submitBtn.disabled = false;
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    });

    if (error) throw error;

    if (data?.session) {
      const userId = data.session.user.id;
      await supabase.from('profiles').upsert(
        {
          id: userId,
          full_name: fullName || data.session.user.user_metadata?.full_name || 'Потребител',
          role,
        },
        { onConflict: 'id' }
      );

      showMessage('Успешна регистрация и вход. Пренасочване...', 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 500);
      return;
    }

    showMessage('Регистрацията е успешна. Провери имейла си за потвърждение. Пренасочваме те към вход...', 'success');
    setTimeout(() => {
      window.location.href = 'login.html?notice=confirm_email';
    }, 1000);
  } catch (err) {
    showMessage(`Грешка при регистрация: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
});


