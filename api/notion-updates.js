// Novedades de producto desde la base "Product Updates" de Notion (CX Partners → Humand Product Updates).
import fs from 'node:fs';
import path from 'node:path';
import { json, query } from './_lib/http.js';

const TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_UPDATES_DB_ID || '03efef8f22f74ddaa5b5839ed670a42d';
const cache = new Map();

const txt = p => (p?.rich_text || p?.title || []).map(t => t.plain_text).join('').trim();

function mapPage(pg) {
  const P = pg.properties || {};
  return {
    id: pg.id,
    title: txt(P['Funcionalidad']),
    module: P['Módulo']?.select?.name || '',
    type: P['Tipo']?.select?.name || 'Update',
    date: P['Lanzamiento']?.date?.start || null,
    desc: txt(P['Descripción (ES)']),
    url: P['Documentación']?.url || null,
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const k = `${i.module}|${i.title.toLowerCase()}`;
    if (!i.title || seen.has(k)) return false;
    seen.add(k); return true;
  });
}

async function fetchNotion(modules, since) {
  const out = [];
  let cursor;
  const filter = { and: [{ property: 'Lanzamiento', date: { on_or_after: since } }] };
  if (modules.length) filter.and.push({ or: modules.map(m => ({ property: 'Módulo', select: { equals: m } })) });
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter, sorts: [{ property: 'Lanzamiento', direction: 'descending' }], page_size: 100, start_cursor: cursor }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || `Notion ${r.status}`);
    out.push(...j.results.map(mapPage));
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return out;
}

export default async function handler(req, res) {
  const q = query(req);
  const modules = (q.modules || '').split('|').map(s => s.trim()).filter(Boolean);
  const days = Math.min(Number(q.days) || 120, 730);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const key = `${modules.sort().join('|')}#${since}`;
  try {
    let items;
    const hit = cache.get(key);
    if (hit && hit.t > Date.now() - 30 * 60e3) items = hit.items;
    else if (TOKEN) {
      items = dedupe(await fetchNotion(modules, since));
      cache.set(key, { t: Date.now(), items });
    } else if (!process.env.VERCEL) {
      const f = path.join(process.cwd(), '.data', 'notion-fixture.json');
      const all = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
      items = dedupe(all.filter(i => (!modules.length || modules.includes(i.module)) && (i.date || '') >= since));
    } else {
      return json(res, 200, { items: [], configured: false });
    }
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    json(res, 200, { items, configured: true });
  } catch (e) { json(res, 502, { error: e.message, items: [] }); }
}
