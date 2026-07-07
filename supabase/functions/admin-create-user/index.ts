// Supabase Edge Function: admin-create-user
// Lets an ADMIN create a login account (teacher/student/parent/admin) with a
// temporary password, pre-confirmed email, and a matching profile row.
// Uses the service_role key (auto-injected) which must never touch the browser.
//
// Deploy: Supabase Dashboard -> Edge Functions -> Deploy a new function
//   name: admin-create-user   (paste this file's contents)
// No extra secrets needed — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically.
//
// Returns HTTP 200 with { ok: boolean, error?: string, ... } for all expected
// outcomes so the browser client can read the message directly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ALLOWED_ROLES = ['admin', 'teacher', 'student', 'parent'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    // Identify the caller from their JWT.
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!jwt) return json({ ok: false, error: 'Липсва оторизация.' });

    const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
    if (callerErr || !caller?.user) return json({ ok: false, error: 'Невалидна сесия.' });

    // Only admins may create accounts.
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.user.id)
      .single();
    if (callerProfile?.role !== 'admin') {
      return json({ ok: false, error: 'Само администратор може да създава акаунти.' });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = ALLOWED_ROLES.includes(body.role) ? body.role : 'student';
    const fullName = String(body.full_name || '').trim();
    const phone = body.phone ? String(body.phone).trim() : null;
    const address = body.address ? String(body.address).trim() : null;

    if (!email) return json({ ok: false, error: 'Имейлът е задължителен.' });
    if (password.length < 8) return json({ ok: false, error: 'Паролата трябва да е поне 8 символа.' });

    // Create the auth user (email pre-confirmed so they can log in immediately).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name: fullName },
    });
    if (createErr || !created?.user) {
      return json({ ok: false, error: createErr?.message || 'Неуспешно създаване на акаунт.' });
    }

    // Upsert the matching profile.
    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: created.user.id,
        full_name: fullName || email.split('@')[0],
        role,
        phone,
        address,
      },
      { onConflict: 'id' },
    );
    if (profErr) {
      return json({ ok: true, id: created.user.id, email, role, warning: `Профилът не се записа напълно: ${profErr.message}` });
    }

    return json({ ok: true, id: created.user.id, email, role });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
