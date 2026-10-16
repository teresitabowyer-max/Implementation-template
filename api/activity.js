import { json, query, requireUser, methodNotAllowed } from './_lib/http.js';
import { getPlan, accessFor, listActivity } from './_lib/db.js';

export default async function handler(req, res) {
  const user = requireUser(req, res); if (!user) return;
  if (req.method !== 'GET') return methodNotAllowed(res);
  try {
    const plan = await getPlan(query(req).plan);
    if (!plan || !(await accessFor(plan, user))) return json(res, 404, { error: 'Plan no encontrado' });
    json(res, 200, { activity: await listActivity(plan.id) });
  } catch (e) { json(res, 500, { error: e.message }); }
}
