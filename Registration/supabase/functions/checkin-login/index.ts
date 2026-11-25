// Supabase Edge Function `checkin-login` (verify_jwt = false; it is the authentication itself).
// Check-in app login: member code only -> a session, if the member's CURRENT position is เขต or higher and not blocked.
// Same session claims as the `login` function, so other apps see the same identity. Failed tries are rate-limited per code and per IP.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

const WINDOW_MS = 15 * 60 * 1000, MAX_PER_CODE = 5, MAX_PER_IP = 20;
const DENIED = 'รหัสไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าใช้งาน';
const TOO_MANY = 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Level = 'all' | 'phak' | 'khet' | 'tambon' | 'moo';
function levelOf(po: string | null): Level | null {
  if (!po) return null;
  if (po.includes('รวมภาค')) return 'all';
  if (po.includes('ภูมิภาค') || po.includes('ภาค')) return 'phak';
  if (po.includes('เขต') || po.includes('ฝ่าย')) return 'khet';
  if (po.includes('ตำบล')) return 'tambon';
  if (po.includes('หมู่')) return 'moo';
  return null;
}
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();

async function count(key: string) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await admin.from('login_attempts').select('id', { count: 'exact', head: true }).eq('key', key).gte('created_at', since);
  return count ?? 0;
}
async function fail(keys: string[]) {
  await admin.from('login_attempts').insert(keys.map((key) => ({ key })));
  return json({ error: DENIED }, 401);
}
const serverError = (step: string, err: unknown) => { console.error('checkin-login failed at', step, err); return json({ error: 'server' }, 500); };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const ip = clientIp(req);
  const keys = [`ci:code:${code}`, `ci:ip:${ip}`];
  const [nCode, nIp] = await Promise.all(keys.map(count));
  if (nCode >= MAX_PER_CODE || nIp >= MAX_PER_IP) return json({ error: TOO_MANY }, 429);

  if (!/^\d{1,12}$/.test(code)) return await fail([keys[1]]);

  const { data: m } = await admin.from('tokan')
    .select('mt_co,given_name,family_name,position_name,phak_name,khet_name,tambon_name,moo_name').eq('mt_co', Number(code)).maybeSingle();
  if (!m) return await fail(keys);
  const level = levelOf(m.position_name);
  if (level !== 'khet' && level !== 'phak' && level !== 'all') return await fail(keys);
  const { data: blocked } = await admin.from('member_blocks').select('mt_co').eq('mt_co', m.mt_co).maybeSingle();
  if (blocked) return await fail(keys);

  const name = norm([m.given_name, m.family_name].filter(Boolean).join(' '));
  const claims = { mt_co: m.mt_co, level, po: m.position_name, name, phak: m.phak_name, khet: m.khet_name, tambon: m.tambon_name, moo: m.moo_name };
  const email = `m${m.mt_co}@login.bkk11.invalid`;

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data.user) return serverError('generateLink', link.error);
  const upd = await admin.auth.admin.updateUserById(link.data.user.id, { app_metadata: claims });
  if (upd.error) return serverError('updateUserById', upd.error);
  const otpType = (link.data.properties.verification_type ?? 'magiclink') as 'magiclink' | 'signup';
  const ver = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: otpType });
  if (ver.error || !ver.data.session) return serverError('verifyOtp', ver.error);
  const s = ver.data.session;
  return json({
    session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at },
    profile: { name, po: m.position_name, level, phak: m.phak_name, khet: m.khet_name },
  });
});
