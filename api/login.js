import { json, readBody, checkPassword, issueToken, issueMagic, readToken, isTeamEmail, normEmail, nameFromEmail, DOMAIN, methodNotAllowed } from './_lib/http.js';
import { sendMail, mailConfigured, baseUrl } from './_lib/mail.js';

const DEV = !process.env.VERCEL;
// Con mail configurado: link de acceso por mail. Sin mail: mail @dominio + contraseña del equipo (modo transitorio).
export const loginMode = () => (mailConfigured || DEV ? 'link' : 'password');

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  const b = await readBody(req);

  // 2) Vuelve del mail con el link → canjeamos por una sesión
  if (b.magic) {
    const m = readToken(b.magic);
    if (!m || m.t !== 'magic' || !isTeamEmail(m.email)) return json(res, 401, { error: 'El link venció o ya no es válido. Pedí uno nuevo.' });
    const user = { name: m.name || nameFromEmail(m.email), email: m.email };
    return json(res, 200, { token: issueToken(user), user });
  }

  const email = normEmail(b.email);
  if (!isTeamEmail(email)) return json(res, 400, { error: `Usá tu mail de @${DOMAIN}` });
  const name = String(b.name || '').trim().slice(0, 80) || nameFromEmail(email);

  if (loginMode() === 'password') {
    if (!checkPassword(b.password)) return json(res, 401, { error: 'Contraseña incorrecta' });
    const user = { name, email };
    return json(res, 200, { token: issueToken(user), user });
  }

  // 1) Pide el link
  const link = `${baseUrl()}/?acceso=${encodeURIComponent(issueMagic(email, name))}`;
  try {
    await sendMail({
      to: [email], subject: 'Tu link para entrar a Planes de implementación',
      html: `<div style="font-family:Roboto,Arial,sans-serif;max-width:480px;margin:auto;color:#303036">
        <h2 style="color:#213478">Hola ${name.split(' ')[0]} 👋</h2>
        <p>Tocá el botón para entrar a <b>Planes de implementación · Humand</b>. El link vence en 20 minutos y solo funciona para vos.</p>
        <p style="margin:28px 0"><a href="${link}" style="background:#496be3;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Entrar</a></p>
        <p style="font-size:12px;color:#8d8c9f">Si no pediste este mail, ignoralo.</p></div>`,
    });
  } catch (e) { return json(res, 500, { error: 'No pudimos enviar el mail: ' + e.message }); }
  json(res, 200, { sent: true, ...(DEV && !mailConfigured ? { devLink: link } : {}) });
}
