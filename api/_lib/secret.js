// Cifrado de las credenciales de acceso a las comunidades (AES-256-GCM).
// La clave se deriva de SESSION_SECRET, así no hace falta configurar nada nuevo en Vercel.
import crypto from 'node:crypto';

const DEV = !process.env.VERCEL;
const BASE = process.env.SESSION_SECRET || (DEV ? 'dev-secret' : null);
const key = () => { if (!BASE) throw new Error('Falta SESSION_SECRET'); return crypto.createHash('sha256').update(`credenciales:${BASE}`).digest(); };

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map(b => b.toString('base64url')).join('.');
}
export function decrypt(enc) {
  if (!enc) return '';
  const [iv, tag, ct] = enc.split('.').map(s => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
