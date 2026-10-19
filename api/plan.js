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
    if (!canEdit(access)) return json(res, 403, { error: user ? 'No tenés permiso para editar este plan. Pedile al responsable que te lo comparta.' : 'Solo el equipo de Humand puede editar este plan.' });
    if (req.method === 'PUT') {
      const { data, expectedUpdatedAt } = await readBody(req);
      if (!data || typeof data !== 'object') return json(res, 400, { error: 'Datos inválidos' });
      if (JSON.stringify(data).length > 4_000_000) return json(res, 413, { error: 'El plan es demasiado grande (¿logo muy pesado?)' });
      const out = await updatePlan(id, { data, client_name: data.client?.name, expectedUpdatedAt, user: user.email });
      if (out.notFound) return json(res, 404, { error: 'Plan no encontrado' });
      if (out.conflict) return json(res, 409, { error: 'Otra persona guardó cambios mientras editabas.', plan: out.current });
      try { await addActivity(id, user.email, diffPlan(plan.data, data)); } catch (e) { console.error('historial', e.message); }
      return json(res, 200, { updated_at: out.plan.updated_at });
    }
    if (req.method === 'DELETE') {
      if (access !== 'owner') return json(res, 403, { error: 'Solo el responsable del plan puede archivarlo.' });
      await archivePlan(id); return json(res, 200, { ok: true });
    }
    methodNotAllowed(res);
  } catch (e) { json(res, 500, { error: e.message }); }
}
