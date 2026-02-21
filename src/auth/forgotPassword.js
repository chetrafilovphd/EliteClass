import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('forgot-form');
const msg = document.getElementById('msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = 'Изчакване...';

  const email = document.getElementById('email').value.trim();

  try {
    const basePath = window.location.pathname.replace(/[^/]*$/, '');
    const redirectTo = `${window.location.origin}${basePath}reset-password.html`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;

    msg.textContent = 'Изпратихме линк за смяна на парола. Провери имейла си.';
    form.reset();
  } catch (err) {
    msg.textContent = `Грешка: ${err.message}`;
  }
});


