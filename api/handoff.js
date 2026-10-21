// Traspasos por vacaciones: la tabla que antes se armaba en Google Sheets.
// Se arma sola con los planes compartidos como "traspaso" y los datos de cada plan. La ve todo el equipo.
import { json, query, requireUser, normEmail, methodNotAllowed, nameFromEmail } from './_lib/http.js';
import { listHandoffs, listSettings, getSettings, teamPeople, addActivity } from './_lib/db.js';
import { decrypt } from './_lib/secret.js';
import { planUrl } from './_lib/mail.js';

// Fecha en hora de Argentina (la vuelta se guarda como 23:59 de ese día, que en UTC ya es el día siguiente).
const day = iso => (iso ? (String(iso).length === 10 ? String(iso) : new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })) : null);
const todayAR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

// Datos que salen solos del plan (no se cargan dos veces).
function fromPlan(p) {
  const d = p.data || {}; const hs = d.hubspot || {};
  const rows = d.rows || [];
  const steps = rows;
  const pct = steps.length ? Math.round(100 * steps.filter(r => r.done).length / steps.length) : 0;
  const contacts = (d.client?.contacts || []).filter(c => c.name || c.email);
  const minutas = [...(d.minutas || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const lastMin = minutas[0];
  const links = [{ label: 'Plan', url: planUrl(p.id) }];
  if (hs.url) links.push({ label: 'HubSpot', url: hs.url });
  if (lastMin?.url) links.push({ label: `Última reunión${lastMin.date ? ` (${lastMin.date.slice(8, 10)}/${lastMin.date.slice(5, 7)})` : ''}`, url: lastMin.url });
  return {
    client: d.client?.name || p.client_name,
    users: hs.users || '',
    status: [hs.cxStage || hs.stage || '', `${pct}% del plan`].filter(Boolean).join(' · '),
    golive: d.dates?.golive || null,
    champion: contacts.map(c => [c.name, c.role].filter(Boolean).join(' (') + (c.role ? ')' : '')).join(' · '),
    format: d.meetingFormat || '',
    integrations: rows.filter(r => r.type === 'integration').map(r => r.name).join(' · ') || hs.integrations || '',
    openTasks: (d.minutas || []).flatMap(m => m.tasks || []).filter(t => !t.done).length,
    redlist: !!d.internal?.redlist,
    links,
  };
}

export default async function handler(req, res) {
  const user = requireUser(req, res); if (!user) return;
  if (req.method !== 'GET') return methodNotAllowed(res);
  const q = query(req);
  try {
    // Mis credenciales guardadas (para precargar al compartir) + personas del equipo para elegir responsable.
    if (q.settings) {
      const s = await getSettings(user.email);
      return json(res, 200, { settings: { user: s?.cred_user || user.email, cmb: s?.cmb_url || '', hasPass: !!s?.cred_pass_enc, updatedAt: s?.updated_at || null }, people: (await teamPeople()).filter(e => e !== user.email) });
    }

    const list = await listHandoffs(21);

    // Ver la contraseña: solo la dueña o quien la cubre en un traspaso vigente. Queda registrado en el historial.
    if (q.creds) {
      const owner = normEmail(q.creds);
      const now = new Date().toISOString();
      const mine = list.filter(x => x.plan.owner_email === owner && (x.share.email === user.email || owner === user.email) && (!x.share.expires_at || x.share.expires_at >= now));
      if (!mine.length) return json(res, 403, { error: 'Solo la persona que cubre el traspaso puede ver las credenciales.' });
      const s = (await listSettings([owner]))[0];
      if (!s?.cred_pass_enc) return json(res, 404, { error: 'No hay contraseña guardada.' });
      if (owner !== user.email) { try { await addActivity(mine[0].plan.id, user.email, ['Vio las credenciales de acceso del traspaso']); } catch {} }
      return json(res, 200, { user: s.cred_user, pass: decrypt(s.cred_pass_enc) });
    }

    const owners = [...new Set(list.map(x => x.plan.owner_email))];
    const settings = new Map((await listSettings(owners)).map(s => [s.email, s]));
    const today = todayAR();
    const groups = owners.map(owner => {
      const items = list.filter(x => x.plan.owner_email === owner);
      const from = items.map(x => day(x.share.starts_at)).filter(Boolean).sort()[0] || null;
      const until = items.map(x => day(x.share.expires_at)).filter(Boolean).sort().pop() || null;
      const s = settings.get(owner);
      return {
        owner, ownerName: nameFromEmail(owner), from, until,
        state: until && until < today ? 'ended' : from && from > today ? 'upcoming' : 'active',
        access: { user: s?.cred_user || owner, cmb: s?.cmb_url || '', hasPass: !!s?.cred_pass_enc, canSee: !!s?.cred_pass_enc && (owner === user.email || items.some(x => x.share.email === user.email)) },
        rows: items.map(({ share: sh, plan: p }) => {
          const auto = fromPlan(p);
          return {
            planId: p.id, ...auto, format: sh.format || auto.format || 'Reunión semanal (ver agenda del plan)',
            priority: sh.priority || '', info: sh.info || '', cards: sh.cards || '', returnNotes: sh.return_notes || '',
            responsible: sh.email, responsibleName: nameFromEmail(sh.email), role: sh.role,
            mine: sh.email === user.email, isOwner: owner === user.email,
          };
        }).sort((a, b) => ['Alta', 'Media', 'Baja', ''].indexOf(a.priority) - ['Alta', 'Media', 'Baja', ''].indexOf(b.priority) || a.client.localeCompare(b.client)),
      };
    }).sort((a, b) => ['active', 'upcoming', 'ended'].indexOf(a.state) - ['active', 'upcoming', 'ended'].indexOf(b.state) || (a.from || '').localeCompare(b.from || ''));
    json(res, 200, { groups, me: user.email });
  } catch (e) { json(res, 500, { error: e.message }); }
}
