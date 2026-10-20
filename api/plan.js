import { json, readBody, query, currentUser, methodNotAllowed } from './_lib/http.js';
import { getPlan, updatePlan, archivePlan, accessFor, canEdit, addActivity } from './_lib/db.js';
import { diffPlan } from './_lib/activity.js';

// GET es público (link del cliente, solo lectura). Editar requiere ser dueño o tenerlo compartido con edición.
export default async function handler(req, res) {
  const { id } = query(req);
  if (!id) return json(res, 400, { error: 'Falta id' });
  const user = currentUser(req);
  try {
    const plan = await getPlan(id);
    if (!plan) return json(res, 404, { error: 'Plan no encontrado' });
    const access = await accessFor(plan, user);
    if (req.method === 'GET') {
      // Lo interno (deal de HubSpot, redlist) solo lo recibe el equipo con acceso al plan.
      const data = access ? plan.data : (({ hubspot, internal, ...rest }) => rest)(plan.data || {});
      return json(res, 200, {
        plan: { id: plan.id, data, updated_at: plan.updated_at, updated_by: access ? plan.updated_by : undefined, owner_email: access ? plan.owner_email : undefined },
        canEdit: canEdit(access), access,
      });
    }
    if (req.method === 'PATCH') return clientCheck(req, res, plan, access);
    if (!canEdit(access)) return json(res, 403, { error: user ? 'No tenés permiso para editar este plan. Pedile al responsable que te lo comparta.' : 'Solo el equipo de Humand puede editar este plan.' });
    if (req.method === 'PUT') {
      let { data, expectedUpdatedAt } = await readBody(req);
      if (!data || typeof data !== 'object') return json(res, 400, { error: 'Datos inválidos' });
      if (JSON.stringify(data).length > 4_000_000) return json(res, 413, { error: 'El plan es demasiado grande (¿logo muy pesado?)' });
      // Si desde que cargaste el plan solo hubo tildes del cliente (ningún otro guardado del equipo),
      // no es un conflicto: se suman sus tildes a tu versión y se guarda igual.
      let applied = [];
      if (expectedUpdatedAt && expectedUpdatedAt !== plan.updated_at && (plan.data?._teamRev || null) === (data._teamRev || null)) {
        applied = mergeClientChecks(plan.data, data);
        expectedUpdatedAt = plan.updated_at;
      }
      data._teamRev = crypto.randomUUID();
      const out = await updatePlan(id, { data, client_name: data.client?.name, expectedUpdatedAt, user: user.email });
      if (out.notFound) return json(res, 404, { error: 'Plan no encontrado' });
      if (out.conflict) return json(res, 409, { error: 'Otra persona guardó cambios mientras editabas.', plan: out.current });
      try { await addActivity(id, user.email, diffPlan(plan.data, data)); } catch (e) { console.error('historial', e.message); }
      return json(res, 200, { updated_at: out.plan.updated_at, teamRev: data._teamRev, applied });
    }
    if (req.method === 'DELETE') {
      if (access !== 'owner') return json(res, 403, { error: 'Solo el responsable del plan puede archivarlo.' });
      await archivePlan(id); return json(res, 200, { ok: true });
    }
    methodNotAllowed(res);
  } catch (e) { json(res, 500, { error: e.message }); }
}

// ---------- tildes del cliente ----------
// El cliente (link público) solo puede marcar o desmarcar tareas de las minutas. Nada más.
const todayAR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const findTask = (data, minutaId, taskId) => {
  const m = (data?.minutas || []).find(x => x.id === minutaId);
  return m && (m.tasks || []).find(t => t.id === taskId);
};

async function clientCheck(req, res, plan, access) {
  if (access === 'view' || access === 'leader') return json(res, 403, { error: 'Tenés acceso de solo lectura a este plan.' });
  const { minuta, task, done } = await readBody(req);
  if (!minuta || !task || typeof done !== 'boolean') return json(res, 400, { error: 'Datos inválidos' });
  if (plan.data?.settings?.showMinutas === false) return json(res, 403, { error: 'Esta sección no está disponible.' });
  for (let i = 0; i < 4; i++) {
    const data = plan.data || {};
    const t = findTask(data, minuta, task);
    if (!t) return json(res, 404, { error: 'La tarea ya no existe. Recargá la página.' });
    if (!!t.done === done) return json(res, 200, { ok: true, task: { done: !!t.done, doneAt: t.doneAt || null, doneBy: t.doneBy || null } });
    const at = new Date().toISOString();
    Object.assign(t, { done, doneAt: done ? todayAR() : null, doneBy: done ? 'cliente' : null });
    data.clientChecks = { ...(data.clientChecks || {}), [task]: { minuta, done, at } };
    const out = await updatePlan(plan.id, { data, client_name: data.client?.name, expectedUpdatedAt: plan.updated_at, user: 'cliente' });
    if (out.notFound) return json(res, 404, { error: 'Plan no encontrado' });
    if (out.conflict) { plan = out.current; continue; }
    try { await addActivity(plan.id, 'Cliente', [`${done ? 'Completó' : 'Reabrió'} la tarea «${t.text || 'tarea'}»`]); } catch (e) { console.error('historial', e.message); }
    return json(res, 200, { ok: true, task: { done, doneAt: t.doneAt, doneBy: t.doneBy } });
  }
  json(res, 409, { error: 'El plan se está actualizando. Probá de nuevo en unos segundos.' });
}

// Lleva a la versión del equipo los tildes que hizo el cliente y que esa versión todavía no tiene.
function mergeClientChecks(stored, incoming) {
  const applied = [];
  const sc = stored?.clientChecks || {};
  const ic = incoming.clientChecks = { ...(incoming.clientChecks || {}) };
  for (const [taskId, c] of Object.entries(sc)) {
    if (ic[taskId] && ic[taskId].at >= c.at) continue;
    ic[taskId] = c;
    const st = findTask(stored, c.minuta, taskId), t = findTask(incoming, c.minuta, taskId);
    if (!t || !st) continue;
    Object.assign(t, { done: !!st.done, doneAt: st.doneAt || null, doneBy: st.doneBy || null });
    applied.push({ minuta: c.minuta, task: taskId, done: !!st.done, doneAt: st.doneAt || null, doneBy: st.doneBy || null });
  }
  return applied;
}
