/* Plan de implementación — secciones: integraciones, etapa 2, reuniones, minutas, producto. */
(function () {
  const P = window.P; const st = P.st; const esc = P.esc;
  const { D, MODULES } = window.CATALOG;
  const V = P.views = {};

  // ---------- integraciones ----------
  V.integrations = () => {
    if (!P.show('showIntegrations')) return '';
    const ints = st.data.rows.filter(r => r.type === 'integration');
    if (!ints.length && !P.editing()) return '';
    const ed = P.editing();
    return `<div class="section-title"><h2>Integraciones</h2><span class="muted">· sistemas que se conectan con Humand durante la implementación</span>${P.hiddenForClient('showIntegrations')}
      ${ed ? `<div class="actions no-print"><button class="btn sm ghost" data-act="add-integration">＋ Agregar integración</button></div>` : ''}</div>
      ${ints.length ? `<div class="integ">${ints.map(r => {
        const it = r.integration || {}; const s = P.rowStatus(r);
        const nm = it.name || r.name.replace(/^Integraci[oó]n con /i, '');
        const chipCls = { ok: 'ok', late: 'err', moved: 'warn', run: 'info', pend: '' }[s.k];
        return `<div class="card">
          <h3><span class="sys">${esc(nm.slice(0, 3).toUpperCase())}</span>${esc(nm)}</h3>
          <p class="muted" style="font-size:13px">${esc(it.desc || 'Integración en paralelo a la configuración de módulos.')}</p>
          <div class="row" style="gap:6px;margin-top:4px">
            <span class="chip ${chipCls}">${esc(s.label)}</span>
            ${r.start ? `<span class="chip">${D.short(r.start)} → ${D.short(r.end || r.start)}</span>` : ''}
            ${it.type ? `<span class="chip accent">${esc(it.type)}</span>` : ''}
            ${ed ? `<button class="icon-btn" data-editrow="${r.id}" style="margin-left:auto">✎ Editar</button>` : ''}
          </div></div>`;
      }).join('')}</div>` : `<div class="empty">¿El cliente tiene alguna integración (SAP, Workday, nómina, SSO…)? Agregala para que corra en paralelo en el cronograma.</div>`}`;
  };

  // ---------- etapa 2 ----------
  V.stage2 = () => {
    const keys = st.data.stage2 || [];
    if (!keys.length) return '';
    const mods = keys.map(k => MODULES.find(m => m.key === k)).filter(Boolean);
    return `<div class="section-title"><h2>Post-lanzamiento</h2><span class="muted">· módulos a implementar en una segunda etapa</span></div>
      <div class="row" style="gap:8px">${mods.map(m => `<a class="chip accent" style="text-decoration:none;padding:6px 12px;font-size:13px" href="${esc(m.hc)}" target="_blank" rel="noopener">${esc(m.name)}</a>`).join('')}</div>`;
  };

  // ---------- reuniones: dedicación + agenda ----------
  V.reuniones = () => {
    const d = st.data; const ed = P.editing();
    let html = '';
    if (P.show('showDedication')) {
      const dd = d.dedication;
      const ce = k => ed ? `contenteditable="true" data-ded="${k}"` : '';
      html += `<div class="section-title"><h2>Estructura de trabajo y reuniones</h2>${P.hiddenForClient('showDedication')}</div>
      <div class="card"><div class="dedic">
        <div><div class="big"><span ${ce('percent')}>${esc(dd.percent ?? 30)}</span>%</div><div class="muted">dedicación promedio</div></div>
        <div><h3 style="font-size:16px;margin-bottom:6px">Dedicación esperada del equipo ${esc(d.client.name)} durante la implementación</h3>
          <p style="color:var(--text-2);font-size:13px" ${ce('text')}>${esc(dd.text || '')}</p></div>
      </div>
      <div style="overflow-x:auto"><table class="dedic-t"><thead><tr><th>Rol</th>${(dd.phases || []).map((p, i) => `<th ${ed ? `contenteditable="true" data-ph="${i}.name"` : ''}>${esc(p.name)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td><b>Equipo ${esc(d.client.name)}</b><div class="muted" style="font-size:12px">Configura la plataforma con guía de Humand</div></td>${(dd.phases || []).map((p, i) => `<td ${ed ? `contenteditable="true" data-ph="${i}.client"` : ''}>${esc(p.client)}</td>`).join('')}</tr>
          <tr><td><b>Equipo Humand</b><div class="muted" style="font-size:12px">Capacitación, guía y soporte técnico</div></td>${(dd.phases || []).map((p, i) => `<td ${ed ? `contenteditable="true" data-ph="${i}.humand"` : ''}>${esc(p.humand)}</td>`).join('')}</tr>
        </tbody></table></div></div>`;
    }
    if (P.show('showAgenda')) {
      html += `<div class="section-title"><h2>Agenda semanal</h2><span class="muted">· cada reunión abre con 10 minutos de preguntas y dudas · hacé clic para desplegar</span>${P.hiddenForClient('showAgenda')}</div>
        <div class="agenda">${V.agendaWeeks()}</div>`;
    }
    return html;
  };

  V.weekInfo = w => {
    const rows = st.data.rows.filter(r => r.start);
    const inW = s => s >= w.mon && s <= w.sun;
    const starting = rows.filter(r => inW(r.start));
    const ending = rows.filter(r => !inW(r.start) && inW(r.end || r.start));
    const running = rows.filter(r => r.start < w.mon && (r.end || r.start) > w.sun);
    const short = r => r.type === 'module' ? r.name.split(' (')[0] : r.type === 'integration' ? (r.integration?.name || r.name) : (r.label || r.name);
    const parts = [];
    ending.filter(r => r.type === 'module').forEach(r => parts.push('Cierre ' + short(r)));
    starting.forEach(r => parts.push(r.type === 'integration' ? 'Arranque ' + (r.integration?.name || short(r)) : r.type === 'module' ? short(r) : r.name));
    ending.filter(r => r.type !== 'module').forEach(r => parts.push(r.name));
    const title = parts.length ? [...new Set(parts)].slice(0, 4).join(' · ') : running.length ? 'Continuación de ' + running.filter(r => r.type === 'module').map(short).slice(0, 3).join(', ') : 'Seguimiento';
    const chips = [...new Set([...starting, ...running, ...ending].map(short))];
    return { starting, ending, running, title, chips };
  };

  V.agendaWeeks = () => {
    const d = st.data; const ed = P.editing();
    const hol = P.holidays();
    const gl = d.dates.golive ? D.monday(d.dates.golive) : null;
    return P.weeks().filter(w => !gl || w.mon <= gl).map(w => {
      const info = V.weekInfo(w); const ov = d.agenda[w.mon] || {};
      const cur = P.today >= w.mon && P.today <= w.sun;
      const hs = hol.filter(h => h.date >= w.mon && h.date <= w.sun);
      const li = (label, arr) => arr.length ? `<div><b>${label}:</b> ${arr.map(r => esc(r.name)).join(' · ')}</div>` : '';
      return `<details class="wk ${cur ? 'current' : ''}" ${cur || st.printing ? 'open' : ''}>
        <summary><div class="wn"><b>S${w.i}</b><small>${D.range(w.mon, w.sun)}</small></div>
          <div><div class="wt">${esc(ov.title || info.title)}</div><div class="chips">${info.chips.slice(0, 6).map(c => `<span class="chip accent">${esc(c)}</span>`).join('')}${hs.map(h => `<span class="chip err">Feriado ${D.short(h.date)}</span>`).join('')}${cur ? '<span class="chip ok">Semana actual</span>' : ''}</div></div>
          <span class="arrow">▸</span></summary>
        <div class="body">
          ${li('Arrancan', info.starting)}${li('Continúan', info.running)}${li('Cierran', info.ending)}
          ${hs.map(h => `<div style="color:var(--err-700)">📅 ${D.short(h.date)} · ${esc(h.name)} (feriado)</div>`).join('')}
          ${ed ? `<div class="grid2 no-print" style="margin-top:6px">
              <label class="field"><span>Título de la semana (opcional)</span><input class="input" data-ag="${w.mon}.title" value="${esc(ov.title || '')}" placeholder="${esc(info.title)}"></label>
              <label class="field"><span>Temario / notas para el cliente</span><textarea class="input" data-ag="${w.mon}.notes" rows="2">${esc(ov.notes || '')}</textarea></label></div>`
          : ov.notes ? `<div style="white-space:pre-wrap;color:var(--text)">${esc(ov.notes)}</div>` : ''}
        </div></details>`;
    }).join('');
  };

  // ---------- minutas y tareas ----------
  V.minutas = () => {
    const d = st.data; const ed = P.editing();
    const list = [...d.minutas].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const allTasks = list.flatMap(m => m.tasks || []);
    const done = allTasks.filter(t => t.done).length;
    let html = `<div class="section-title"><h2>Minutas y tareas</h2><span class="muted">· acuerdos de cada reunión y próximos pasos${allTasks.length ? ` · ${done}/${allTasks.length} tareas completadas` : ''}</span>${P.hiddenForClient('showMinutas')}
      ${ed ? `<div class="actions no-print"><button class="btn sm ghost" data-act="digest">✉ Resumen semanal${d.settings.digest.on ? ' · activo' : ''}</button><button class="btn sm" data-act="new-minuta">＋ Nueva minuta</button></div>` : ''}</div>`;
    if (!list.length) return html + `<div class="empty">${ed ? 'Pegá la minuta de la reunión y detectamos las tareas automáticamente. Después podés programar recordatorios por mail.' : 'Todavía no hay minutas cargadas.'}</div>`;
    html += `<div style="display:flex;flex-direction:column;gap:16px">${list.map(m => `
      <article class="minuta">
        <header><div style="flex:1"><div class="row" style="gap:8px;margin-bottom:4px"><span class="chip accent">${m.date ? D.long(m.date) : 'Sin fecha'}</span></div><h3>${esc(m.title || 'Reunión')}</h3></div>
          ${ed ? `<button class="icon-btn" data-minuta="${m.id}" title="Editar minuta">✎ Editar</button><button class="icon-btn" data-delminuta="${m.id}" title="Eliminar">🗑</button>` : ''}</header>
        ${m.summary ? `<div class="sum">${esc(m.summary)}</div>` : ''}
        ${(m.tasks || []).length ? `<div style="display:flex;flex-direction:column;gap:6px">${m.tasks.map(t => V.task(m, t)).join('')}</div>` : ''}
      </article>`).join('')}</div>`;
    return html;
  };

  V.task = (m, t) => {
    const ed = P.editing();
    const late = !t.done && t.due && t.due < P.today;
    const rem = (st.reminders || []).filter(r => r.status === 'scheduled' && (r.task_id || '').split(',').includes(t.id));
    return `<div class="task ${t.done ? 'done' : ''}">
      <input type="checkbox" class="check" data-task="${m.id}:${t.id}" ${t.done ? 'checked' : ''} ${ed ? '' : 'disabled'}>
      <div><div class="tt">${esc(t.text)}</div>
        <div class="tm">${t.owner ? `<span class="chip">👤 ${esc(t.owner)}</span>` : ''}${t.due ? `<span class="chip ${late ? 'err' : t.done ? 'ok' : ''}">📅 ${D.short(t.due)}${late ? ' · vencida' : ''}</span>` : ''}${t.done && t.doneAt ? `<span class="chip ok">✓ ${D.short(t.doneAt)}</span>` : ''}${ed && rem.length ? `<span class="chip warn">🔔 ${rem.map(r => D.short(r.send_at.slice(0, 10))).join(', ')}</span>` : ''}</div></div>
      ${ed ? `<div class="ta"><button class="icon-btn bell ${rem.length ? 'on' : ''}" data-remind="${m.id}:${t.id}" title="Recordatorio por mail">🔔</button></div>` : '<span></span>'}
    </div>`;
  };

  // ---------- producto (Notion) ----------
  const notionToPlan = () => {
    const map = new Map();
    const keys = [...st.data.rows.filter(r => r.type === 'module').map(r => r.key), ...(st.data.stage2 || [])];
    keys.forEach(k => { const m = MODULES.find(x => x.key === k); if (m) m.notion.forEach(n => { if (!map.has(n)) map.set(n, m.name); }); });
    if (st.data.rows.some(r => r.type === 'integration')) map.set('Integrations', 'Integraciones');
    return map;
  };

  P.loadUpdates = async () => {
    const map = notionToPlan();
    if (!map.size) { st.updates = []; st.updatesState = 'done'; return; }
    st.updatesState = 'loading';
    try {
      const j = await P.api(`/api/notion-updates?days=${st.data.updates.days || 120}&modules=${encodeURIComponent([...map.keys()].join('|'))}`);
      st.updates = j.items || []; st.updatesState = j.configured === false ? 'unconfigured' : 'done';
    } catch (e) { st.updatesState = 'error'; st.updatesError = e.message; }
    if (st.tab === 'producto') P.render();
  };

  const statusCls = s => /no (en|disp)|no se/i.test(s) ? 'err' : /disponible/i.test(s) ? 'ok' : /desarrollo|beta/i.test(s) ? 'info' : /roadmap/i.test(s) ? 'warn' : 'accent';

  V.producto = () => {
    const d = st.data; const ed = P.editing(); const map = notionToPlan();
    const hidden = new Set(d.updates.hidden);
    const manual = d.updates.manual || [];
    const notion = (st.updates || []).filter(u => ed || !hidden.has(u.id)).sort((x, y) => { const fx = (x.date || '') > P.today, fy = (y.date || '') > P.today; return fx !== fy ? (fx ? -1 : 1) : fx ? x.date.localeCompare(y.date) : (y.date || '').localeCompare(x.date || ''); });
    let html = `<div class="section-title"><h2>Actualizaciones del producto</h2><span class="muted">· novedades y respuestas sobre los módulos de ${esc(d.client.name)}</span>${P.hiddenForClient('showUpdates')}
      ${ed ? `<div class="actions no-print">
        <select class="input" style="width:auto;padding:5px 8px;font-size:12px" data-upd-days>${[60, 120, 180, 365].map(n => `<option value="${n}" ${Number(d.updates.days) === n ? 'selected' : ''}>Últimos ${n} días</option>`).join('')}</select>
        <button class="btn sm ghost" data-act="add-update">＋ Agregar novedad o respuesta</button></div>` : ''}</div>`;
    if (ed && st.updatesState === 'unconfigured') html += `<div class="empty" style="margin-bottom:12px">La conexión con Notion todavía no está configurada (falta <code>NOTION_TOKEN</code>). Mientras tanto podés cargar novedades a mano.</div>`;
    if (st.updatesState === 'error' && ed) html += `<div class="empty" style="margin-bottom:12px">No pudimos leer Notion: ${esc(st.updatesError)}</div>`;
    const cards = [];
    manual.forEach(u => cards.push(`<div class="upd">
      <div class="mod">${esc(u.module || 'General')}</div><h4>${esc(u.title)}</h4><p>${esc(u.desc || '')}</p>
      <div class="ft"><span class="chip ${statusCls(u.status || '')}">${esc(u.status || 'Disponible')}</span>${ed ? `<button class="icon-btn" data-editupd="${u.id}" style="margin-left:auto">✎</button>` : ''}</div></div>`));
    notion.forEach(u => {
      const future = u.date && u.date > P.today;
      const link = u.url && !/notion\.(so|site)/.test(u.url) ? `<a href="${esc(u.url)}" target="_blank" rel="noopener">Ver más →</a>` : '';
      cards.push(`<div class="upd ${hidden.has(u.id) ? 'hidden-item' : ''}">
        ${ed ? `<button class="icon-btn hide" data-hideupd="${u.id}" title="${hidden.has(u.id) ? 'Mostrar al cliente' : 'Ocultar al cliente'}">${hidden.has(u.id) ? '🙈' : '👁'}</button>` : ''}
        <div class="mod">${esc(map.get(u.module) || u.module)}</div><h4>${esc(u.title)}</h4><p>${esc(u.desc || '')}</p>
        <div class="ft"><span class="chip ${future ? 'info' : 'ok'}">${future ? 'Próximamente · ' + D.short(u.date) : 'Disponible · ' + D.short(u.date)}</span>${u.type === 'Gran lanzamiento' ? '<span class="chip accent">★ Gran lanzamiento</span>' : ''}${link}</div></div>`);
    });
    if (st.updatesState === 'loading' && !cards.length) return html + '<div class="empty">Buscando novedades en Notion…</div>';
    if (!cards.length) return html + `<div class="empty">No hay novedades recientes para los módulos de este plan.</div>`;
    return html + `<div class="upd-grid">${cards.join('')}</div>${ed ? '<p class="muted no-print" style="font-size:12px;margin-top:10px">Fuente: Notion · Humand Product Updates. Usá 👁 para ocultar al cliente lo que no aplica.</p>' : ''}`;
  };
})();
