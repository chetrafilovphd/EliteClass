import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('reset-form');
const msg = document.getElementById('msg');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('toggle-password');

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

function isStrongPassword(password) {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  return password.length >= 8 && hasUpper && hasLower && hasNumber && hasSymbol;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = 'Изчакване...';

  const password = document.getElementById('password').value;

  if (!isStrongPassword(password)) {
    msg.textContent = 'Грешка: паролата не покрива изискванията.';
    return;
  }

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    msg.textContent = 'Паролата е сменена успешно. Пренасочване към вход...';
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1300);
  } catch (err) {
    msg.textContent = `Грешка: ${err.message}`;
  }
});



