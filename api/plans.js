import crypto from 'node:crypto';
import { json, readBody, requireUser, methodNotAllowed } from './_lib/http.js';
import { listPlans, createPlan, getPlan } from './_lib/db.js';

export function newId(name) {
  const slug = String(name || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'cliente';
  return `${slug}-${crypto.randomBytes(5).toString('hex')}`;
}

export default async function handler(req, res) {
  const user = requireUser(req, res); if (!user) return;
  try {
    if (req.method === 'GET') return json(res, 200, { plans: await listPlans() });
    if (req.method === 'POST') {
      const body = await readBody(req);
      let data = body.data;
      if (body.duplicateOf) {
        const src = await getPlan(body.duplicateOf);
        if (!src) return json(res, 404, { error: 'Plan original no encontrado' });
        data = structuredClone(src.data);
        data.client = { ...data.client, name: body.name || `${data.client?.name || ''} (copia)` };
      }
      if (!data?.client?.name) return json(res, 400, { error: 'Falta el nombre del cliente' });
      data.humand = data.humand?.name ? data.humand : { name: user.name, email: user.email };
      const plan = await createPlan({ id: newId(data.client.name), client_name: data.client.name, data, user: user.email });
      return json(res, 201, { plan });
    }
    methodNotAllowed(res);
  } catch (e) { json(res, 500, { error: e.message }); }
}
