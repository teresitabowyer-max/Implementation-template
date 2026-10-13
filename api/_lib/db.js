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
export async function listPlans() {
  if (LOCAL) {
    return readLocal().plans
      .filter(p => !p.archived)
      .map(({ id, client_name, updated_at, created_at, data }) => ({ id, client_name, updated_at, created_at, summary: summarize(data) }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const rows = await sb('plans?select=id,client_name,updated_at,created_at,data&archived=eq.false&order=updated_at.desc');
  return rows.map(({ data, ...r }) => ({ ...r, summary: summarize(data) }));
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
    owner: d.humand?.name || '',
  };
}

export async function getPlan(id) {
  if (LOCAL) return readLocal().plans.find(p => p.id === id && !p.archived) || null;
  const rows = await sb(`plans?id=eq.${encodeURIComponent(id)}&archived=eq.false&select=*`);
  return rows[0] || null;
}

export async function createPlan({ id, client_name, data, user }) {
  const row = { id, client_name, data, archived: false, created_at: now(), updated_at: now(), updated_by: user || null };
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
