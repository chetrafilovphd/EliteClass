import { supabase } from '../lib/supabaseClient';

const form = document.getElementById('login-form');
const msg = document.getElementById('msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = 'Изчакване...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    msg.textContent = 'Успешен вход.';
    window.location.href = 'dashboard.html';
  } catch (err) {
    msg.textContent = `Грешка: ${err.message}`;
  }
});


