import { json, readBody, query, currentUser, methodNotAllowed } from './_lib/http.js';
import { getPlan, updatePlan, archivePlan } from './_lib/db.js';

// GET es público (link del cliente, solo lectura). PUT/DELETE requieren sesión del equipo Humand.
export default async function handler(req, res) {
  const { id } = query(req);
  if (!id) return json(res, 400, { error: 'Falta id' });
  const user = currentUser(req);
  try {
    if (req.method === 'GET') {
      const plan = await getPlan(id);
      if (!plan) return json(res, 404, { error: 'Plan no encontrado' });
      return json(res, 200, { plan: { id: plan.id, data: plan.data, updated_at: plan.updated_at, updated_by: user ? plan.updated_by : undefined }, canEdit: !!user });
    }
    if (!user) return json(res, 403, { error: 'Solo el equipo de Humand puede editar este plan.' });
    if (req.method === 'PUT') {
      const { data, expectedUpdatedAt } = await readBody(req);
      if (!data || typeof data !== 'object') return json(res, 400, { error: 'Datos inválidos' });
      if (JSON.stringify(data).length > 4_000_000) return json(res, 413, { error: 'El plan es demasiado grande (¿logo muy pesado?)' });
      const out = await updatePlan(id, { data, client_name: data.client?.name, expectedUpdatedAt, user: user.email });
      if (out.notFound) return json(res, 404, { error: 'Plan no encontrado' });
      if (out.conflict) return json(res, 409, { error: 'Otra persona guardó cambios mientras editabas.', plan: out.current });
      return json(res, 200, { updated_at: out.plan.updated_at });
    }
    if (req.method === 'DELETE') { await archivePlan(id); return json(res, 200, { ok: true }); }
    methodNotAllowed(res);
  } catch (e) { json(res, 500, { error: e.message }); }
}
