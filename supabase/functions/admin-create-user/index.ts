// Supabase Edge Function: admin-create-user
// Lets an ADMIN create a login account (teacher/student/parent/admin) with a
// temporary password, pre-confirmed email, and a matching profile row.
// Uses the service_role key (auto-injected) which must never touch the browser.
//
// Deploy: Supabase Dashboard -> Edge Functions -> admin-create-user -> edit -> Deploy
// No extra secrets needed — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically. (Optional: SUPABASE_JWT_SECRET enables legacy HS256
// fallback verification.)
//
// Caller identity is verified LOCALLY against the project's JWKS (asymmetric
// ES256/ECC signing keys). This is robust to JWT signing-key rotation, unlike
// calling auth.getUser() which failed after the HS256 -> ES256 migration with
// "unrecognized JWT kid <nil> for algorithm ES256".
//
// Returns HTTP 200 with { ok: boolean, error?: string, ... } for all expected
// outcomes so the browser client can read the message directly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify, createRemoteJWKSet } from 'https://esm.sh/jose@5';

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

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!;
// Public JWKS with the project's asymmetric (ES256/ECC) verification keys.
const JWKS = createRemoteJWKSet(new URL(`${PROJECT_URL}/auth/v1/.well-known/jwks.json`));

// Verify the caller's access token and return their user id, or null.
async function getCallerId(jwt: string): Promise<string | null> {
  // 1. Asymmetric verification via JWKS (current ES256/ECC signing key).
  try {
    const { payload } = await jwtVerify(jwt, JWKS);
    if (payload.sub) return String(payload.sub);
  } catch (_e) {
    // fall through to legacy secret
  }
  // 2. Legacy HS256 shared-secret fallback (older still-valid tokens).
  const legacy = Deno.env.get('SUPABASE_JWT_SECRET');
  if (legacy) {
    try {
      const { payload } = await jwtVerify(jwt, new TextEncoder().encode(legacy));
      if (payload.sub) return String(payload.sub);
    } catch (_e) {
      // ignore
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' });

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(PROJECT_URL, serviceKey);

    // Identify the caller from their JWT (verified locally against the JWKS).
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!jwt) return json({ ok: false, error: 'Липсва оторизация.' });

    const callerId = await getCallerId(jwt);
    if (!callerId) return json({ ok: false, error: 'Невалидна сесия.' });

    // Only admins may create accounts.
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerId)
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
    // Retry on transient GoTrue JWT-verification hiccups: after the HS256 -> ES256
    // signing-key rotation, GoTrue intermittently rejects the service_role key with
    // "unrecognized JWT kid <nil> for algorithm ES256". Most calls succeed, so a few
    // retries with backoff make account creation reliable. "already registered" is
    // terminal (the client falls back to a profile lookup by email).
    let created = null;
    let createErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, full_name: fullName },
      });
      created = res.data;
      createErr = res.error;
      if (!createErr && created?.user) break;
      const m = (createErr?.message || '').toLowerCase();
      if (m.includes('already') || m.includes('registered') || m.includes('exists')) break;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
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
