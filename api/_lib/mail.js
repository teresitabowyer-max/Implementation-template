// Envío de mails vía Resend (https://resend.com). En desarrollo, sin API key, se guardan en .data/outbox.
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'Humand Implementación <onboarding@resend.dev>';
export const mailConfigured = !!KEY;

export async function sendMail({ to, cc = [], subject, html, replyTo }) {
  const clean = a => [...new Set((a || []).map(s => String(s).trim()).filter(s => /.+@.+\..+/.test(s)))];
  const payload = { from: FROM, to: clean(to), cc: clean(cc), subject, html };
  if (replyTo) payload.reply_to = replyTo;
  if (!payload.to.length) throw new Error('No hay destinatarios válidos');
  if (!KEY) {
    if (process.env.VERCEL) throw new Error('Falta configurar RESEND_API_KEY');
    const dir = path.join(process.cwd(), '.data', 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${Date.now()}.html`);
    fs.writeFileSync(f, `<!-- to: ${payload.to.join(', ')} | cc: ${payload.cc.join(', ')} | ${subject} -->\n${html}`);
    return { id: 'local-' + path.basename(f) };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.message || `Resend ${r.status}`);
  return out;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = d => { if (!d) return ''; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };

export const baseUrl = () => process.env.PUBLIC_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${process.env.PORT || 3000}`);
export function planUrl(planId) { return `${baseUrl()}/p/${planId}`; }

// Recolecta tareas pendientes de las minutas (opcionalmente filtradas por ids)
export function pendingTasks(data, ids) {
  const out = [];
  for (const m of data.minutas || []) {
    for (const t of m.tasks || []) {
      if (t.done) continue;
      if (ids && !ids.includes(t.id)) continue;
      out.push({ ...t, minuta: m.title, minutaDate: m.date });
    }
  }
  return out.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
}

export function reminderHtml({ data, planId, tasks, intro, upcoming = [] }) {
  const color = data.client?.brandColor || '#4b4fd6';
  const client = esc(data.client?.name || 'Cliente');
  const today = new Date().toISOString().slice(0, 10);
  const rows = tasks.map(t => {
    const late = t.due && t.due < today;
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eceef6;font-size:14px;color:#20233f">${esc(t.text)}
        ${t.minuta ? `<div style="font-size:11px;color:#8a8fb0;margin-top:2px">Minuta: ${esc(t.minuta)}${t.minutaDate ? ' · ' + fmt(t.minutaDate) : ''}</div>` : ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eceef6;font-size:13px;color:#4a4f73;white-space:nowrap">${esc(t.owner || '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eceef6;font-size:13px;white-space:nowrap;color:${late ? '#c0392b' : '#4a4f73'};font-weight:${late ? 700 : 400}">${t.due ? fmt(t.due) + (late ? ' · vencida' : '') : '—'}</td>
    </tr>`;
  }).join('');
  const up = upcoming.length ? `<h3 style="font-size:14px;color:#1b1b4b;margin:22px 0 8px">Esta semana en el cronograma</h3>
    <ul style="margin:0;padding-left:18px;color:#4a4f73;font-size:13px;line-height:1.7">${upcoming.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Segoe UI,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e6f2">
      <div style="height:6px;background:${color}"></div>
      <div style="padding:22px 24px">
        <div style="font-size:11px;letter-spacing:1.5px;color:#8a8fb0;text-transform:uppercase;font-weight:700">Plan de implementación</div>
        <h2 style="margin:6px 0 4px;font-size:20px;color:#1b1b4b">${client} + Humand</h2>
        <p style="margin:0 0 16px;color:#4a4f73;font-size:14px;line-height:1.5">${esc(intro || 'Te compartimos las tareas pendientes acordadas en las últimas reuniones.')}</p>
        ${tasks.length ? `<table style="width:100%;border-collapse:collapse;border:1px solid #eceef6;border-radius:10px">
          <tr style="background:#f7f8fc"><th align="left" style="padding:8px 12px;font-size:11px;color:#8a8fb0;text-transform:uppercase">Tarea</th><th align="left" style="padding:8px 12px;font-size:11px;color:#8a8fb0;text-transform:uppercase">Responsable</th><th align="left" style="padding:8px 12px;font-size:11px;color:#8a8fb0;text-transform:uppercase">Fecha</th></tr>
          ${rows}</table>` : '<p style="color:#2e9e5b;font-size:14px">No hay tareas pendientes. ¡Vamos al día!</p>'}
        ${up}
        <div style="margin-top:22px"><a href="${planUrl(planId)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:9px">Ver plan de trabajo</a></div>
      </div>
    </div>
    <p style="text-align:center;color:#a0a4c0;font-size:11px;margin-top:14px">Enviado por ${esc(data.humand?.name || 'el equipo de Humand')} · Humand</p>
  </div></body></html>`;
}
