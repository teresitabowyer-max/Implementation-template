import { json, readBody, query, requireUser, isTeamEmail, normEmail, DOMAIN, methodNotAllowed } from './_lib/http.js';
import { getPlan, accessFor, listShares, upsertShare, deleteShare, setOwner, addActivity, patchShare, getShare, saveSettings } from './_lib/db.js';
import { encrypt } from './_lib/secret.js';
import { sendMail, mailConfigured, planUrl } from './_lib/mail.js';

const fmt = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function notify(to, subject, text, plan) {
  if (!mailConfigured) return;
  try {
    await sendMail({ to: [to], subject, html: `<div style="font-family:Roboto,Arial,sans-serif;max-width:520px;margin:auto;color:#303036">
      <p>${text}</p><p style="margin:24px 0"><a href="${planUrl(plan.id)}" style="background:#496be3;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Abrir el plan</a></p>
      <p style="font-size:12px;color:#8d8c9f">Lo vas a encontrar en la carpeta “Compartidos conmigo”.</p></div>` });
  } catch (e) { console.error('aviso compartir', e.message); }
}

export default async function handler(req, res) {
  const user = requireUser(req, res); if (!user) return;
  const q = query(req);
  try {
    const b = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {};
    const plan = await getPlan(q.plan || b.plan);
    if (!plan) return json(res, 404, { error: 'Plan no encontrado' });
    const access = await accessFor(plan, user);
    if (!access) return json(res, 404, { error: 'Plan no encontrado' });
    const name = plan.data?.client?.name || plan.client_name;

    if (req.method === 'GET') return json(res, 200, { owner: plan.owner_email, shares: await listShares(plan.id), access });

    if (req.method === 'DELETE') {
      const email = normEmail(q.email);
      if (access !== 'owner' && email !== user.email) return json(res, 403, { error: 'Solo el responsable puede quitar accesos.' });
      await deleteShare(plan.id, email);
      await addActivity(plan.id, user.email, [email === user.email ? 'Dejó de seguir el plan' : `Quitó el acceso a ${email}`]);
      return json(res, 200, { ok: true });
    }

    // Traspaso: el compañero que cubre deja comentarios para la vuelta; el dueño puede corregir los datos del traspaso.
    if (req.method === 'PATCH') {
      const email = normEmail(b.email || user.email);
      const sh = await getShare(plan.id, email);
      if (!sh || !sh.handoff) return json(res, 404, { error: 'No hay un traspaso para ese plan.' });
      const patch = {};
      if (typeof b.returnNotes === 'string' && (email === user.email || access === 'owner')) patch.return_notes = b.returnNotes.slice(0, 5000);
      if (access === 'owner') for (const [k, c] of [['priority', 'priority'], ['info', 'info'], ['cards', 'cards'], ['format', 'format']]) if (typeof b[k] === 'string') patch[c] = b[k].slice(0, 5000);
      if (!Object.keys(patch).length) return json(res, 403, { error: 'No podés modificar este traspaso.' });
      const out = await patchShare(plan.id, email, patch);
      if (patch.return_notes !== undefined) await addActivity(plan.id, user.email, ['Actualizó los comentarios para la vuelta']);
      return json(res, 200, { share: out });
    }

    if (req.method !== 'POST') return methodNotAllowed(res);
    if (access !== 'owner') return json(res, 403, { error: 'Solo el responsable del plan puede compartirlo o transferirlo.' });

    // Transferir el plan a otra persona
    if (b.transferTo) {
      const to = normEmail(b.transferTo);
      if (!isTeamEmail(to)) return json(res, 400, { error: `Usá un mail de @${DOMAIN}` });
      if (to === user.email) return json(res, 400, { error: 'Ya sos el responsable.' });
      await setOwner(plan.id, to);
      await deleteShare(plan.id, to);
      if (b.keepAccess !== false) await upsertShare({ plan_id: plan.id, email: user.email, role: 'edit', created_by: to });
      await addActivity(plan.id, user.email, [`Transfirió el plan a ${to}`]);
      await notify(to, `${user.name} te transfirió el plan de ${name}`, `<b>${esc(user.name)}</b> te transfirió el plan de implementación de <b>${esc(name)}</b>. Desde ahora sos el responsable y lo vas a ver en “Mis proyectos”.`, plan);
      return json(res, 200, { ok: true });
    }

    // Compartir
    const email = normEmail(b.email);
    if (!isTeamEmail(email)) return json(res, 400, { error: `Solo se puede compartir con mails de @${DOMAIN}` });
    if (email === plan.owner_email) return json(res, 400, { error: 'Esa persona ya es la responsable del plan.' });
    const role = b.role === 'view' ? 'view' : 'edit';
    const expires_at = b.until ? new Date(`${b.until}T23:59:59-03:00`).toISOString() : null;
    if (expires_at && expires_at < new Date().toISOString()) return json(res, 400, { error: 'La fecha de vencimiento ya pasó.' });
    const row = { plan_id: plan.id, email, role, expires_at, created_by: user.email };
    if (b.handoff) {
      // Traspaso por vacaciones: pide fechas y confirmar las credenciales de acceso a las comunidades.
      if (!b.until) return json(res, 400, { error: 'Para un traspaso poné la fecha de vuelta.' });
      if (!b.creds || b.creds.ok !== true) return json(res, 400, { error: 'Confirmá las credenciales de acceso antes de compartir.' });
      const c = b.creds;
      const set = { email: user.email, cred_user: String(c.user || '').trim().slice(0, 200), cmb_url: String(c.cmb || '').trim().slice(0, 500) };
      if (c.pass) set.cred_pass_enc = encrypt(String(c.pass).slice(0, 200));
      await saveSettings(set);
      Object.assign(row, { handoff: true, starts_at: b.from || null, updated_at: new Date().toISOString() });
      // Solo se pisan los campos que vienen (el traspaso en bloque no manda el formato, por ejemplo).
      for (const [k, max] of [['priority', 40], ['info', 5000], ['cards', 5000], ['format', 500]]) if (typeof b[k] === 'string') row[k] = b[k].slice(0, max);
    }
    const sh = await upsertShare(row);
    await addActivity(plan.id, user.email, [`${b.handoff ? 'Traspaso por vacaciones: compartió el plan' : 'Compartió el plan'} con ${email} (${role === 'edit' ? 'puede editar' : 'solo ver'}${b.until ? ` hasta el ${fmt(b.until)}` : ''})`]);
    await notify(email, `${user.name} te compartió el plan de ${name}`,
      `<b>${esc(user.name)}</b> te compartió el plan de implementación de <b>${esc(name)}</b> (${role === 'edit' ? 'podés editarlo' : 'solo lectura'})${b.until ? ` hasta el <b>${fmt(b.until)}</b>` : ''}.`, plan);
    json(res, 201, { share: sh });
  } catch (e) { json(res, 500, { error: e.message }); }
}
