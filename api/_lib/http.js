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

// ---------- sesiones: cada persona de Humand entra con su mail ----------
const DEV = !process.env.VERCEL;
const SECRET = process.env.SESSION_SECRET || (DEV ? 'dev-secret' : null);
const PASSWORD = process.env.ADMIN_PASSWORD || (DEV ? 'humand' : null);
export const DOMAIN = (process.env.ALLOWED_DOMAIN || 'humand.co').toLowerCase();
const LEADERS = (process.env.LEADER_EMAILS || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);

const b64 = s => Buffer.from(s).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

export const normEmail = e => String(e || '').trim().toLowerCase();
export const isTeamEmail = e => { const m = normEmail(e); return /^[^@\s]+@[^@\s]+$/.test(m) && m.endsWith('@' + DOMAIN); };
export const isLeader = e => LEADERS.includes(normEmail(e));
export const nameFromEmail = e => normEmail(e).split('@')[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

export function checkPassword(pw) {
  if (!PASSWORD || !SECRET) return false;
  const a = Buffer.from(String(pw || ''));
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function makeToken(obj, ms) {
  const payload = b64(JSON.stringify({ ...obj, exp: Date.now() + ms }));
  return `${payload}.${sign(payload)}`;
}
export function readToken(tok) {
  if (!SECRET || !tok) return null;
  const [payload, sig] = String(tok).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { const u = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return u.exp > Date.now() ? u : null; }
  catch { return null; }
}

export const issueToken = user => makeToken({ t: 'session', name: user.name, email: normEmail(user.email) }, 1000 * 60 * 60 * 24 * 30);
export const issueMagic = (email, name) => makeToken({ t: 'magic', email: normEmail(email), name }, 1000 * 60 * 20);

export function currentUser(req) {
  const h = req.headers['authorization'] || '';
  const u = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!u || u.t === 'magic' || !isTeamEmail(u.email)) return null;
  const email = normEmail(u.email);
  return { name: u.name || nameFromEmail(email), email, leader: isLeader(email) };
}

export function requireUser(req, res) {
  const u = currentUser(req);
  if (!u) { json(res, 401, { error: 'Necesitás iniciar sesión con tu mail de Humand.' }); return null; }
  return u;
}

export function methodNotAllowed(res) { json(res, 405, { error: 'Método no permitido' }); }
