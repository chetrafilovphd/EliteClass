import { supabase } from '../lib/supabaseClient';

const form = document.getElementById('reset-form');
const msg = document.getElementById('msg');

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


