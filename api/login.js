import { json, readBody, checkPassword, issueToken, methodNotAllowed } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  const { name, email, password } = await readBody(req);
  if (!checkPassword(password)) return json(res, 401, { error: 'Contraseña incorrecta' });
  if (!name || !email) return json(res, 400, { error: 'Completá tu nombre y mail' });
  const user = { name: String(name).slice(0, 80), email: String(email).slice(0, 120) };
  json(res, 200, { token: issueToken(user), user });
}
