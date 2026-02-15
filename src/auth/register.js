import { supabase } from '../lib/supabaseClient';

const form = document.getElementById('register-form');
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

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const role = document.getElementById('role').value;

  if (!isStrongPassword(password)) {
    msg.textContent = 'Грешка: слаба парола. Използвай главна и малка буква, цифра и символ.';
    return;
  }

  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    });

    if (error) throw error;

    msg.textContent = 'Успешна регистрация. Сега влез в профила си.';
    form.reset();
  } catch (err) {
    msg.textContent = `Грешка: ${err.message}`;
  }
});

