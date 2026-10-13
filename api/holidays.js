// Feriados nacionales por país (Nager.Date, sin API key). Respaldo local si el servicio no responde.
import { json, query } from './_lib/http.js';
import { FALLBACK } from './_lib/holidays-fallback.js';

const cache = new Map();

export default async function handler(req, res) {
  const { country = 'AR', years = String(new Date().getFullYear()) } = query(req);
  const cc = country.toUpperCase().slice(0, 2);
  const ys = years.split(',').map(Number).filter(y => y > 2000 && y < 2100).slice(0, 3);
  const out = [];
  let source = 'nager';
  for (const y of ys) {
    const k = `${cc}-${y}`;
    if (cache.has(k)) { out.push(...cache.get(k)); continue; }
    try {
      const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/${cc}`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(String(r.status));
      const list = (await r.json()).filter(h => h.global !== false || !h.counties)
        .map(h => ({ date: h.date, name: h.localName || h.name }));
      cache.set(k, list); out.push(...list);
    } catch {
      source = 'fallback';
      out.push(...(FALLBACK[cc]?.[y] || []).map(([date, name]) => ({ date, name })));
    }
  }
  res.setHeader('Cache-Control', 's-maxage=86400');
  json(res, 200, { country: cc, source, holidays: out.sort((a, b) => a.date.localeCompare(b.date)) });
}
