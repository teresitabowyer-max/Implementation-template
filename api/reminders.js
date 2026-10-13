import { json, readBody, query, requireUser, methodNotAllowed } from './_lib/http.js';
import { getPlan, listReminders, createReminder, deleteReminder } from './_lib/db.js';
import { sendMail, reminderHtml, pendingTasks } from './_lib/mail.js';

const list = v => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map(s => s.trim()).filter(Boolean);

export default async function handler(req, res) {
  const user = requireUser(req, res); if (!user) return;
  const q = query(req);
  try {
    if (req.method === 'GET') {
      if (!q.plan) return json(res, 400, { error: 'Falta plan' });
      return json(res, 200, { reminders: await listReminders(q.plan) });
    }
    if (req.method === 'DELETE') {
      await deleteReminder(q.id, q.plan);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const plan = await getPlan(b.plan);
      if (!plan) return json(res, 404, { error: 'Plan no encontrado' });
      const to = list(b.to), cc = list(b.cc);
      if (!to.length) return json(res, 400, { error: 'Agregá al menos un destinatario' });
      const taskIds = b.taskIds?.length ? b.taskIds : null;
      const subject = b.subject || `Recordatorio · Plan de implementación ${plan.data.client?.name || ''}`;
      if (b.sendNow) {
        const tasks = pendingTasks(plan.data, taskIds);
        await sendMail({ to, cc, subject, replyTo: user.email, html: reminderHtml({ data: plan.data, planId: plan.id, tasks, intro: b.intro }) });
        const r = await createReminder({ plan_id: plan.id, task_id: taskIds?.join(',') || null, kind: b.kind || 'manual', recipients: to, cc, subject, body: b.intro || null, send_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString(), created_by: user.email });
        return json(res, 201, { reminder: r });
      }
      if (!b.sendAt) return json(res, 400, { error: 'Elegí una fecha de envío' });
      const r = await createReminder({ plan_id: plan.id, task_id: taskIds?.join(',') || null, kind: b.kind || 'task', recipients: to, cc, subject, body: b.intro || null, send_at: new Date(b.sendAt).toISOString(), created_by: user.email });
      return json(res, 201, { reminder: r });
    }
    methodNotAllowed(res);
  } catch (e) { json(res, 500, { error: e.message }); }
}
