import crypto from 'node:crypto';

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel ya lo parsea
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function query(req) {
  const u = new URL(req.url, 'http://x');
  return Object.fromEntries(u.searchParams.entries());
}

// ---------- sesiones de equipo Humand ----------
const DEV = !process.env.VERCEL;
const SECRET = process.env.SESSION_SECRET || (DEV ? 'dev-secret' : null);
const PASSWORD = process.env.ADMIN_PASSWORD || (DEV ? 'humand' : null);

const b64 = s => Buffer.from(s).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

export function checkPassword(pw) {
  if (!PASSWORD || !SECRET) return false;
  const a = Buffer.from(String(pw || ''));
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueToken(user) {
  const payload = b64(JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
  return `${payload}.${sign(payload)}`;
}

export function currentUser(req) {
  if (!SECRET) return null;
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [payload, sig] = tok.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const u = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return u.exp > Date.now() ? u : null;
  } catch { return null; }
}

export function requireUser(req, res) {
  const u = currentUser(req);
  if (!u) { json(res, 401, { error: 'Necesitás iniciar sesión con la contraseña del equipo.' }); return null; }
  return u;
}

export function methodNotAllowed(res) { json(res, 405, { error: 'Método no permitido' }); }
