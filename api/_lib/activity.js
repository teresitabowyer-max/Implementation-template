// Resume en frases cortas qué cambió entre dos versiones de un plan (para el historial).
const fmt = d => { if (!d) return '—'; const [, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}`; };
const range = r => (r.start === r.end ? fmt(r.start) : `${fmt(r.start)}–${fmt(r.end)}`);
const nm = r => `«${r.name || r.label || 'fila'}»`;

export function diffPlan(a = {}, b = {}) {
  const out = [];
  const ra = new Map((a.rows || []).map(r => [r.id, r]));
  const rb = new Map((b.rows || []).map(r => [r.id, r]));
  for (const [id, r] of rb) {
    const o = ra.get(id);
    if (!o) { out.push(`Agregó la fila ${nm(r)}`); continue; }
    if (o.start !== r.start || o.end !== r.end) out.push(`Movió ${nm(r)}: ${range(o)} → ${range(r)}`);
    if (!!o.done !== !!r.done) out.push(r.done ? `Marcó ${nm(r)} como completada` : `Volvió a abrir ${nm(r)}`);
    if ((o.name || '') !== (r.name || '')) out.push(`Renombró ${nm(o)} a ${nm(r)}`);
    const na = (o.notes || []).length, nb = (r.notes || []).length;
    if (nb > na) out.push(`Agregó una nota en ${nm(r)}`);
    else if (nb < na) out.push(`Borró una nota de ${nm(r)}`);
  }
  for (const [id, r] of ra) if (!rb.has(id)) out.push(`Eliminó la fila ${nm(r)}`);
  const orderA = (a.rows || []).map(r => r.id).filter(id => rb.has(id)).join();
  const orderB = (b.rows || []).map(r => r.id).filter(id => ra.has(id)).join();
  if (orderA !== orderB) out.push('Reordenó filas del cronograma');
  if (a.dates?.golive !== b.dates?.golive) out.push(`Cambió el go-live: ${fmt(a.dates?.golive)} → ${fmt(b.dates?.golive)}`);
  const ma = (a.minutas || []).length, mb = (b.minutas || []).length;
  if (mb > ma) out.push('Agregó una minuta');
  else if (mb < ma) out.push('Eliminó una minuta');
  const tasks = d => (d.minutas || []).flatMap(m => m.tasks || []);
  const ta = new Map(tasks(a).map(t => [t.id, t]));
  for (const t of tasks(b)) { const o = ta.get(t.id); if (o && !!o.done !== !!t.done) out.push(`${t.done ? 'Completó' : 'Reabrió'} la tarea «${t.text || t.title || 'tarea'}»`); }
  if ((a.client?.name || '') !== (b.client?.name || '')) out.push(`Cambió el nombre del cliente a «${b.client?.name || ''}»`);
  if (out.length > 12) return [...out.slice(0, 11), `…y ${out.length - 11} cambios más`];
  return out;
}
