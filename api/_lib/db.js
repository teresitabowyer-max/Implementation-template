// Capa de datos: Supabase (producción) o archivo JSON local (desarrollo).
// Todas las llamadas usan la service key desde el servidor; el navegador nunca habla con Supabase.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL = !SB_URL || !SB_KEY;
const LOCAL_FILE = path.join(process.cwd(), '.data', 'db.json');

export const isLocal = LOCAL;

// ---------- modo local ----------
function readLocal() {
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')); }
  catch { return { plans: [], reminders: [] }; }
}
function readLocalFull() {
  const db = readLocal(); db.shares ||= []; db.activity ||= []; return db;
}
function writeLocal(db) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(db, null, 2));
}

// ---------- modo supabase ----------
async function sb(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const now = () => new Date().toISOString();

// ---------- planes ----------
const card = ({ data, ...r }) => ({ ...r, summary: summarize(data) });
const nowIso = () => new Date().toISOString();
const activeShare = sh => !sh.expires_at || sh.expires_at > nowIso();

// Devuelve las tres carpetas: mis proyectos, compartidos conmigo y (líderes) todo el equipo.
export async function listPlansFor(user) {
  const me = user.email;
  let all, shares;
  if (LOCAL) {
    const db = readLocalFull();
    all = db.plans.filter(p => !p.archived);
    shares = db.shares.filter(sh => sh.email === me && activeShare(sh));
  } else {
    shares = (await sb(`plan_shares?email=eq.${encodeURIComponent(me)}&select=*`)).filter(activeShare);
    const sel = 'select=id,client_name,owner_email,updated_at,updated_by,created_at,data&archived=eq.false&order=updated_at.desc';
    if (user.leader) all = await sb(`plans?${sel}`);
    else {
      const ids = shares.map(sh => `"${sh.plan_id.replace(/"/g, '')}"`).join(',');
      all = await sb(`plans?${sel}&or=(owner_email.eq.${encodeURIComponent(me)}${ids ? `,id.in.(${encodeURIComponent(ids)})` : ''})`);
    }
  }
  all.sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at)));
  const byId = new Map(shares.map(sh => [sh.plan_id, sh]));
  const mine = all.filter(p => p.owner_email === me).map(card);
  const shared = all.filter(p => p.owner_email !== me && byId.has(p.id))
    .map(p => ({ ...card(p), share: { role: byId.get(p.id).role, expires_at: byId.get(p.id).expires_at, by: byId.get(p.id).created_by } }));
  const team = user.leader ? all.filter(p => p.owner_email !== me).map(card) : [];
  return { mine, shared, team };
}

function summarize(d = {}) {
  const rows = (d.rows || []).filter(r => r.type !== 'group');
  const done = rows.filter(r => r.done).length;
  return {
    golive: d.dates?.golive || null,
    start: d.dates?.start || null,
    progress: rows.length ? Math.round((done / rows.length) * 100) : 0,
    brandColor: d.client?.brandColor || null,
    hasLogo: !!d.client?.logo,
    redlist: !!d.internal?.redlist,
    redlistReason: d.internal?.redlistReason || '',
    stage: d.hubspot?.stage || '',
    pilot: d.hubspot?.pilot || '',
    owner: d.humand?.name || '',
  };
}

export async function getPlan(id) {
  if (LOCAL) return readLocal().plans.find(p => p.id === id && !p.archived) || null;
  const rows = await sb(`plans?id=eq.${encodeURIComponent(id)}&archived=eq.false&select=*`);
  return rows[0] || null;
}

export async function createPlan({ id, client_name, data, user }) {
  const row = { id, client_name, data, owner_email: user, archived: false, created_at: now(), updated_at: now(), updated_by: user || null };
  if (LOCAL) { const db = readLocal(); db.plans.push(row); writeLocal(db); return row; }
  const out = await sb('plans', { method: 'POST', body: row, prefer: 'return=representation' });
  return out[0];
}

// Concurrencia optimista: si otra persona guardó antes, devolvemos conflicto.
export async function updatePlan(id, { data, client_name, expectedUpdatedAt, user }) {
  const patch = { data, client_name, updated_at: now(), updated_by: user || null };
  if (LOCAL) {
    const db = readLocal();
    const p = db.plans.find(x => x.id === id);
    if (!p) return { notFound: true };
    if (expectedUpdatedAt && p.updated_at !== expectedUpdatedAt) return { conflict: true, current: p };
    Object.assign(p, patch); writeLocal(db); return { plan: p };
  }
  let q = `plans?id=eq.${encodeURIComponent(id)}`;
  if (expectedUpdatedAt) q += `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`;
  const out = await sb(q, { method: 'PATCH', body: patch, prefer: 'return=representation' });
  if (!out.length) {
    const current = await getPlan(id);
    return current ? { conflict: true, current } : { notFound: true };
  }
  return { plan: out[0] };
}

export async function archivePlan(id) {
  if (LOCAL) { const db = readLocal(); const p = db.plans.find(x => x.id === id); if (p) p.archived = true; writeLocal(db); return; }
  await sb(`plans?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { archived: true } });
}

// ---------- recordatorios ----------
export async function listReminders(planId) {
  if (LOCAL) return readLocal().reminders.filter(r => r.plan_id === planId).sort((a, b) => a.send_at.localeCompare(b.send_at));
  return sb(`reminders?plan_id=eq.${encodeURIComponent(planId)}&order=send_at.asc&select=*`);
}

export async function createReminder(r) {
  const row = {
    id: crypto.randomUUID(), status: 'scheduled', created_at: now(), sent_at: null, error: null,
    cc: [], task_id: null, kind: 'task', ...r,
  };
  if (LOCAL) { const db = readLocal(); db.reminders.push(row); writeLocal(db); return row; }
  const out = await sb('reminders', { method: 'POST', body: row, prefer: 'return=representation' });
  return out[0];
}

export async function deleteReminder(id, planId) {
  if (LOCAL) { const db = readLocal(); db.reminders = db.reminders.filter(r => !(r.id === id && r.plan_id === planId)); writeLocal(db); return; }
  await sb(`reminders?id=eq.${encodeURIComponent(id)}&plan_id=eq.${encodeURIComponent(planId)}`, { method: 'DELETE' });
}

export async function dueReminders(untilIso) {
  if (LOCAL) return readLocal().reminders.filter(r => r.status === 'scheduled' && r.send_at <= untilIso);
  return sb(`reminders?status=eq.scheduled&send_at=lte.${encodeURIComponent(untilIso)}&select=*`);
}

export async function markReminder(id, patch) {
  if (LOCAL) { const db = readLocal(); const r = db.reminders.find(x => x.id === id); if (r) Object.assign(r, patch); writeLocal(db); return; }
  await sb(`reminders?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

export async function plansWithDigest() {
  const all = LOCAL ? readLocal().plans.filter(p => !p.archived)
    : await sb('plans?archived=eq.false&select=id,client_name,data');
  return all.filter(p => p.data?.settings?.digest?.on);
}

// ---------- permisos ----------
export async function getShare(planId, email) {
  if (LOCAL) return readLocalFull().shares.find(sh => sh.plan_id === planId && sh.email === email) || null;
  const r = await sb(`plan_shares?plan_id=eq.${encodeURIComponent(planId)}&email=eq.${encodeURIComponent(email)}&select=*`);
  return r[0] || null;
}

// owner | edit | view | leader | null
export async function accessFor(plan, user) {
  if (!plan || !user) return null;
  if (plan.owner_email === user.email) return 'owner';
  const sh = await getShare(plan.id, user.email);
  if (sh && activeShare(sh)) return sh.role === 'view' ? 'view' : 'edit';
  if (user.leader) return 'leader';
  return null;
}
export const canEdit = a => a === 'owner' || a === 'edit';

export async function listShares(planId) {
  if (LOCAL) return readLocalFull().shares.filter(sh => sh.plan_id === planId);
  return sb(`plan_shares?plan_id=eq.${encodeURIComponent(planId)}&select=*&order=created_at.asc`);
}
export async function upsertShare(row) {
  const r = { created_at: now(), expires_at: null, role: 'edit', ...row };
  if (LOCAL) { const db = readLocalFull(); db.shares = db.shares.filter(sh => !(sh.plan_id === r.plan_id && sh.email === r.email)); db.shares.push(r); writeLocal(db); return r; }
  const out = await sb('plan_shares?on_conflict=plan_id,email', { method: 'POST', body: r, prefer: 'resolution=merge-duplicates,return=representation' });
  return out[0];
}
export async function deleteShare(planId, email) {
  if (LOCAL) { const db = readLocalFull(); db.shares = db.shares.filter(sh => !(sh.plan_id === planId && sh.email === email)); writeLocal(db); return; }
  await sb(`plan_shares?plan_id=eq.${encodeURIComponent(planId)}&email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' });
}
export async function setOwner(planId, email) {
  if (LOCAL) { const db = readLocalFull(); const p = db.plans.find(x => x.id === planId); if (p) p.owner_email = email; writeLocal(db); return; }
  await sb(`plans?id=eq.${encodeURIComponent(planId)}`, { method: 'PATCH', body: { owner_email: email } });
}

// ---------- historial ----------
export async function addActivity(planId, actor, summaries) {
  if (!summaries.length) return;
  const rows = summaries.map(summary => ({ id: crypto.randomUUID(), plan_id: planId, actor, summary, created_at: now() }));
  if (LOCAL) { const db = readLocalFull(); db.activity.push(...rows); writeLocal(db); return; }
  await sb('plan_activity', { method: 'POST', body: rows });
}
export async function listActivity(planId, limit = 200) {
  if (LOCAL) return readLocalFull().activity.filter(a => a.plan_id === planId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  return sb(`plan_activity?plan_id=eq.${encodeURIComponent(planId)}&select=*&order=created_at.desc&limit=${limit}`);
}

// ---------- novedades de producto sincronizadas desde Notion (sin token) ----------
export async function syncedUpdates(since) {
  if (LOCAL) return { items: [], syncedAt: null };
  const rows = await sb(`product_updates?date=gte.${since}&select=id,title,module,type,date,descr,url,synced_at&order=date.desc&limit=1000`);
  const syncedAt = rows.reduce((m, r) => (r.synced_at > m ? r.synced_at : m), '') || null;
  return { items: rows.map(r => ({ id: r.id, title: r.title, module: r.module || '', type: r.type || 'Update', date: r.date, desc: r.descr || '', url: r.url })), syncedAt };
}
