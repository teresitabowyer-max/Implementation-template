// Corre una vez por día (vercel.json → crons). Envía recordatorios vencidos y resúmenes semanales.
import { json } from './_lib/http.js';
import { getPlan, dueReminders, markReminder, plansWithDigest, listReminders, createReminder } from './_lib/db.js';
import { sendMail, reminderHtml, pendingTasks } from './_lib/mail.js';

const ids = s => (s ? String(s).split(',').filter(Boolean) : null);

function weekItems(data, today) {
  const d = new Date(today + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - dow);
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  const a = mon.toISOString().slice(0, 10), b = sun.toISOString().slice(0, 10);
  return (data.rows || []).filter(r => r.type !== 'group' && !r.done && r.start && r.end && r.start <= b && r.end >= a)
    .map(r => `${r.name}${r.end <= b ? ' (cierra esta semana)' : ''}`);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) return json(res, 401, { error: 'unauthorized' });
  const nowIso = new Date().toISOString();
  // fecha local Argentina para resúmenes
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const report = { sent: 0, skipped: 0, failed: 0, digests: 0 };

  for (const r of await dueReminders(nowIso)) {
    try {
      const plan = await getPlan(r.plan_id);
      if (!plan) { await markReminder(r.id, { status: 'skipped', error: 'plan inexistente' }); report.skipped++; continue; }
      const tasks = pendingTasks(plan.data, ids(r.task_id));
      if (r.task_id && !tasks.length) { await markReminder(r.id, { status: 'skipped', error: 'tareas ya completadas' }); report.skipped++; continue; }
      await sendMail({ to: r.recipients, cc: r.cc, subject: r.subject, html: reminderHtml({ data: plan.data, planId: plan.id, tasks, intro: r.body }) });
      await markReminder(r.id, { status: 'sent', sent_at: new Date().toISOString() }); report.sent++;
    } catch (e) { await markReminder(r.id, { status: 'failed', error: e.message }); report.failed++; }
  }

  const weekday = new Date(today + 'T12:00:00Z').getUTCDay(); // 1 = lunes
  for (const p of await plansWithDigest()) {
    const dg = p.data.settings.digest;
    if (Number(dg.weekday ?? 1) !== weekday || !dg.to?.length) continue;
    const already = (await listReminders(p.id)).some(x => x.kind === 'digest' && x.send_at.slice(0, 10) === today);
    if (already) continue;
    try {
      const subject = `Resumen semanal · Plan de implementación ${p.data.client?.name || ''}`;
      const tasks = pendingTasks(p.data);
      await sendMail({ to: dg.to, cc: dg.cc || [], subject, html: reminderHtml({ data: p.data, planId: p.id, tasks, intro: 'Este es el resumen semanal del plan: tareas pendientes y lo que está en curso esta semana.', upcoming: weekItems(p.data, today) }) });
      await createReminder({ plan_id: p.id, kind: 'digest', recipients: dg.to, cc: dg.cc || [], subject, send_at: nowIso, status: 'sent', sent_at: nowIso });
      report.digests++;
    } catch (e) { report.failed++; }
  }
  json(res, 200, report);
}
