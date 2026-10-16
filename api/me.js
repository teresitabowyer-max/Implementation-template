import { json, currentUser, DOMAIN } from './_lib/http.js';
import { isLocal } from './_lib/db.js';
import { mailConfigured } from './_lib/mail.js';
import { loginMode } from './login.js';

// Solo informa NOMBRES de variables faltantes (nunca valores), para diagnosticar la configuración.
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET'];

export default function handler(req, res) {
  const user = currentUser(req);
  const missing = process.env.VERCEL ? REQUIRED.filter(k => !process.env[k]) : [];
  if (process.env.VERCEL && loginMode() === 'password' && !process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  json(res, 200, {
    user,
    config: { local: isLocal, mail: mailConfigured || isLocal, notion: !!process.env.NOTION_TOKEN || isLocal, missing, login: loginMode(), domain: DOMAIN },
  });
}
