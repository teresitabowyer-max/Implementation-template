/* Plan de implementación — núcleo: estado, datos, guardado y render principal (encabezado, resumen, Gantt). */
(function () {
  const { D, uid, MODULES } = window.CATALOG;
  const SNAP = window.__SNAPSHOT__ || null;          // presente en el HTML exportado (solo lectura, sin servidor)
  const P = window.P = {};

  // ---------- estado ----------
  const st = P.st = {
    id: SNAP ? null : decodeURIComponent(location.pathname.split('/p/')[1] || new URLSearchParams(location.search).get('id') || '').replace(/\/$/, ''),
    data: null, updatedAt: null, canEdit: false, access: null, ownerEmail: null, preview: false, user: null, config: {},
    tab: 'plan', updates: [], updatesState: 'idle', reminders: [], saving: 'idle', conflict: null,
    exportOpts: null, printing: false, dayW: 20,
  };

  P.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = P.esc;
  P.$ = s => document.querySelector(s);
  P.today = D.today();

  // ---------- API ----------
  const token = () => { try { return localStorage.getItem('hu_token'); } catch { return null; } };
  P.api = async (path, opts = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    const t = token(); if (t) headers.Authorization = `Bearer ${t}`;
    const r = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.status = r.status; e.body = j; throw e; }
    return j;
  };

  P.toast = (msg, action, fn, ms = 3500) => {
    const t = P.$('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
    if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); fn(); };
    t.classList.add('show');
    clearTimeout(P._tt); P._tt = setTimeout(() => t.classList.remove('show'), action ? 8000 : ms);
  };

  // ---------- guardado automático ----------
  let saveTimer;
  P.save = (immediate) => {
    if (!st.canEdit) return;
    st.saving = 'pending'; P.renderSaveState();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, immediate ? 0 : 700);
  };
  async function doSave(force) {
    st.saving = 'saving'; P.renderSaveState();
    try {
      const r = await P.api(`/api/plan?id=${encodeURIComponent(st.id)}`, { method: 'PUT', body: { data: st.data, expectedUpdatedAt: force ? null : st.updatedAt } });
      st.updatedAt = r.updated_at; st.saving = 'saved'; st.savedAt = new Date();
    } catch (e) {
      if (e.status === 409) { st.conflict = e.body.plan; st.saving = 'conflict'; P.render(); return; }
      st.saving = 'error'; st.saveError = e.message;
    }
    P.renderSaveState();
  }
  P.forceSave = () => { st.conflict = null; doSave(true).then(P.render); };
  P.reloadFromServer = () => { const c = st.conflict; st.conflict = null; st.data = migrate(c.data); st.updatedAt = c.updated_at; P.render(); };
  window.addEventListener('beforeunload', e => { if (st.saving === 'pending' || st.saving === 'saving') { e.preventDefault(); e.returnValue = ''; } });

  P.renderSaveState = () => {
    const el = P.$('#saveState'); if (!el) return;
    const m = { idle: '', pending: 'Cambios sin guardar…', saving: 'Guardando…', saved: `Guardado ${st.savedAt ? st.savedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}`, error: `No se pudo guardar: ${st.saveError || ''}`, conflict: 'Conflicto de edición' };
    el.textContent = m[st.saving] || '';
    el.classList.toggle('err', st.saving === 'error' || st.saving === 'conflict');
  };

  // ---------- normalización de datos (planes viejos o incompletos) ----------
  function migrate(d) {
    d = d || {};
    d.client = d.client || { name: 'Cliente' };
    d.dates = d.dates || {};
    d.rows = d.rows || [];
    d.rows.forEach(r => { r.id = r.id || uid(); r.notes = r.notes || []; if (!r.baseStart) { r.baseStart = r.start; r.baseEnd = r.end; } });
    d.stage2 = d.stage2 || [];
    d.holidays = d.holidays || { country: d.client.country || 'AR', list: [], hidden: [], custom: [] };
    d.holidays.hidden = d.holidays.hidden || []; d.holidays.custom = d.holidays.custom || []; d.holidays.list = d.holidays.list || [];
    d.summary = d.summary || {}; d.dedication = d.dedication || { phases: [] }; d.agenda = d.agenda || {};
    d.minutas = d.minutas || []; d.updates = d.updates || { manual: [], hidden: [], days: 120 };
    d.updates.manual = d.updates.manual || []; d.updates.hidden = d.updates.hidden || [];
    const def = { showProgress: true, showBaseline: true, showToday: true, showHolidays: true, showUpdates: true, showMinutas: true, showAgenda: true, showDedication: true, showIntegrations: true };
    d.settings = { ...def, ...(d.settings || {}) };
    d.settings.digest = d.settings.digest || { on: false, weekday: 1, to: [], cc: [] };
    return d;
  }
  P.migrate = migrate;

  // ---------- visibilidad ----------
  P.editing = () => st.canEdit && !st.preview && !st.printing && !SNAP;
  // ¿Se muestra una sección? En edición se ve todo; para el cliente / exportables se respetan las opciones.
  P.show = flag => {
    if (st.exportOpts) return !!st.exportOpts[flag];
    if (P.editing()) return true;
    return !!st.data.settings[flag];
  };
  P.hiddenForClient = flag => P.editing() && !st.data.settings[flag]
    ? `<span class="chip warn" title="Esta sección no se muestra en el link del cliente">Oculto para el cliente</span>` : '';

  // ---------- color de marca ----------
  const hex2rgb = h => { const m = h.replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb2hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
  const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  P.applyBrand = () => {
    let c = st.data.client.brandColor;
    if (!/^#[0-9a-f]{6}$/i.test(c || '')) c = '#496be3';
    let accent = c; let guard = 0;
    while (lum(accent) > .35 && guard++ < 10) accent = mix(accent, '#000000', .12); // asegura contraste con texto blanco
    const s = document.documentElement.style;
    s.setProperty('--accent', accent);
    s.setProperty('--accent-soft', mix(c, '#ffffff', .9));
    s.setProperty('--accent-ink', mix(accent, '#000000', .35));
  };
  P.colorUtil = { mix, lum, hex2rgb, rgb2hex };

  // ---------- cálculos del cronograma ----------
  P.rows = () => st.data.rows;
  P.rowStatus = r => {
    const t = P.today;
    if (r.done) return { k: 'ok', label: 'Completado' };
    const end = r.end || r.start;
    if (end && end < t) return { k: 'late', label: 'Atrasado' };
    if (r.baseEnd && end > r.baseEnd) return { k: 'moved', label: `Reprogramado (+${D.diff(r.baseEnd, end)} días)` };
    if (r.start && r.start <= t) return { k: 'run', label: 'En curso' };
    return { k: 'pend', label: 'Pendiente' };
  };
  P.range = () => {
    const d = st.data; const rows = d.rows.filter(r => r.start);
    let a = d.dates.start || (rows[0] && rows[0].start) || P.today;
    let b = d.dates.golive || a;
    rows.forEach(r => { if (r.start < a) a = r.start; if ((r.end || r.start) > b) b = r.end || r.start; });
    a = D.monday(a); b = D.add(D.monday(b), 6);
    return { a, b, days: D.diff(a, b) + 1 };
  };
  P.holidays = () => {
    const h = st.data.holidays;
    const all = [...(h.list || []), ...(h.custom || [])];
    const seen = new Set();
    return all.filter(x => !h.hidden.includes(x.date) && !seen.has(x.date) && seen.add(x.date)).sort((x, y) => x.date.localeCompare(y.date));
  };
  P.weeks = () => {
    const { a, b } = P.range(); const out = [];
    for (let m = a, i = 1; m <= b; m = D.add(m, 7), i++) out.push({ i, mon: m, sun: D.add(m, 6) });
    return out;
  };
  P.moduleName = r => r.name;

  // ---------- render principal ----------
  P.render = () => {
    const d = st.data;
    P.applyBrand();
    document.title = `Plan de trabajo · ${d.client.name} + Humand`;
    document.body.classList.toggle('can-edit', P.editing());
    const tabs = P.tabs();
    if (!tabs.find(t => t.k === st.tab)) st.tab = 'plan';
    const panels = st.printing ? tabs.map(t => t.k) : [st.tab];
    const html = `
      ${st.access && !SNAP ? P.editBar() : ''}
      ${st.conflict ? `<div class="conflict-banner">Otra persona guardó cambios en este plan mientras editabas. <button class="btn sm ghost" data-act="reload">Ver su versión</button> <button class="btn sm danger" data-act="force">Mantener la mía</button></div>` : ''}
      ${st.preview ? `<div class="preview-banner">Estás viendo el plan como lo ve el cliente. <a href="#" data-act="preview">Volver a editar</a></div>` : ''}
      ${P.header()}
      <nav class="tabs"><div class="wrap">
        ${tabs.map((t, i) => `<button class="tab ${t.k === st.tab ? 'on' : ''}" data-tab="${t.k}"><span class="n">${i + 1}</span>${t.label}</button>`).join('')}
        <span style="flex:1"></span>
        ${!P.editing() ? `<button class="tab no-print" data-act="print-client" title="Descargar en PDF">⬇ PDF</button>` : ''}
      </div></nav>
      ${panels.map(k => `<main class="panel wrap" data-panel="${k}">${P.panel(k)}</main>`).join('')}
      <footer class="wrap pfoot">humand · Plataforma todo en uno para la gestión de RR. HH.<br>Documento preparado para ${esc(d.client.name)}${d.dates.issued ? ' · ' + D.long(d.dates.issued) : ''}${SNAP ? ` · Versión descargada el ${D.dmy(SNAP.generatedAt)}` : ''}${!SNAP && !st.access ? `<br><a href="/?volver=${encodeURIComponent(location.pathname)}" class="no-print" style="color:var(--text-3);font-size:11px">Acceso equipo Humand</a>` : ''}</footer>`;
    const sc = P.$('.gantt-scroll'); const sx = sc ? sc.scrollLeft : null;
    P.$('#app').innerHTML = html;
    P.afterRender(sx);
    P.renderSaveState();
  };

  P.tabs = () => {
    const t = [{ k: 'plan', label: 'Plan de trabajo' }];
    if (P.show('showAgenda') || P.show('showDedication')) t.push({ k: 'reuniones', label: 'Organización de reuniones' });
    if (P.show('showMinutas') && (P.editing() || st.data.minutas.length)) t.push({ k: 'minutas', label: 'Minutas y tareas' });
    if (P.show('showUpdates')) t.push({ k: 'producto', label: 'Producto' });
    return t;
  };

  P.panel = k => {
    if (k === 'plan') return P.hubspotCard() + P.summaryHtml() + P.ganttSection() + (P.views ? P.views.integrations() + P.views.stage2() : '');
    if (k === 'reuniones') return P.views.reuniones();
    if (k === 'minutas') return P.views.minutas();
    if (k === 'producto') return P.views.producto();
    return '';
  };

  P.editBar = () => {
    if (st.preview) return '';
    const who = e => (e || '').split('@')[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    const tag = { owner: 'Modo edición · tu plan', edit: `Modo edición · plan de ${esc(who(st.ownerEmail))}`, view: `Solo lectura · plan de ${esc(who(st.ownerEmail))}`, leader: `Vista de líder · plan de ${esc(who(st.ownerEmail))}` }[st.access] || '';
    return `<div class="editbar no-print"><div class="wrap">
      <a class="back" href="/">← Mis planes</a>
      <span class="tag ${st.access === 'owner' ? '' : 'other'}">${tag}</span>
      <span class="save" id="saveState"></span>
      <span class="sp"></span>
      ${st.canEdit ? '<button class="btn ghost" data-act="preview">👁 Ver como cliente</button>' : ''}
      <button class="btn ghost" data-act="copy-link">🔗 Link del cliente</button>
      ${st.data.hubspot?.url ? `<a class="btn ghost" href="${esc(st.data.hubspot.url)}" target="_blank" rel="noopener" title="Abrir el deal en HubSpot">🟠 HubSpot</a>` : ''}
      ${st.canEdit ? `<button class="btn ghost ${st.data.internal?.redlist ? 'rl-on' : ''}" data-act="redlist">🚩 ${st.data.internal?.redlist ? 'En redlist' : 'Redlist'}</button>` : (st.data.internal?.redlist ? '<span class="tag rl">🚩 Redlist</span>' : '')}
      <button class="btn ghost" data-act="history">🕘 Historial</button>
      ${st.access === 'owner' ? '<button class="btn ghost" data-act="share">👥 Compartir</button>' : ''}
      ${st.canEdit ? '<button class="btn ghost" data-act="config">⚙ Configurar</button><button class="btn" data-act="export">⬇ Exportar</button>' : ''}
    </div></div>`;
  };

  P.header = () => {
    const d = st.data; const c = d.client;
    const { a } = P.range();
    const gl = d.dates.golive;
    const weeks = gl ? Math.round(D.diff(D.monday(d.dates.start || a), D.monday(gl)) / 7) + 1 : P.weeks().length;
    const m1 = D.MONTHS_L[D.parse(d.dates.start || a).getUTCMonth()], m2 = gl ? D.MONTHS_L[D.parse(gl).getUTCMonth()] : '';
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const span = m2 && m2 !== m1 ? `${cap(m1)} – ${cap(m2)} ${D.parse(gl).getUTCFullYear()}` : `${cap(m1)} ${D.parse(d.dates.start || a).getUTCFullYear()}`;
    return `<header class="phead"><div class="wrap">
      <div class="brands">
        <div class="hu-logo">huma<span>n</span>d</div>
        <div class="sep"></div>
        ${c.logo ? `<img class="client-logo" src="${esc(c.logo)}" alt="${esc(c.name)}">` : `<div class="client-name">${esc(c.name)}</div>`}
      </div>
      <div class="ptitle">
        <div class="eyebrow">Plan de implementación</div>
        <h1>Plan de trabajo · ${esc(c.name)} + Humand</h1>
        <p>${span} · ${weeks} semanas hasta el lanzamiento</p>
      </div>
      <div class="pmeta">
        <div><small>Emisión</small><b>${D.long(d.dates.issued || P.today)}</b></div>
        ${gl ? `<div><small>Go-live previsto</small><b>Semana del ${D.short(D.monday(gl))}</b></div>` : ''}
      </div>
    </div></header>`;
  };

  // ---------- resumen ----------
  // Ficha del deal de HubSpot: solo la ve el equipo Humand en modo edición.
  P.hubspotCard = () => {
    const it = st.data.internal || {};
    const rl = it.redlist && P.editing() ? `<div class="rl-banner no-print">🚩 <b>Cliente en redlist</b>${it.redlistReason ? ` · ${esc(it.redlistReason)}` : ''}${it.redlistSince ? `<span class="muted"> · desde el ${new Date(it.redlistSince).toLocaleDateString('es-AR')}</span>` : ''} <span class="muted" style="margin-left:auto">Solo equipo Humand</span></div>` : '';
    const h = st.data.hubspot; if (!h || !P.editing() || (!h.stage && !h.kickoff && !h.ae)) return rl;
    const pilot = Number(h.pilot) > 0 ? `Sí · ${h.pilot} ${Number(h.pilot) === 1 ? 'mes' : 'meses'}` : 'No';
    const items = [['Etapa del deal', h.stage], ['Piloto', pilot], ['Account Executive', h.ae], ['Users', h.users], ['Add-ons', h.addons], ['CX Stage', h.cxStage], ['País', h.country], ['Onboarding Leader', h.leader]].filter(x => x[1]);
    return `<details class="hs-card no-print"><summary><span>🟠 Deal de HubSpot</span>${items.slice(0, 5).map(([k, v]) => `<span class="chip">${esc(k)}: ${esc(v)}</span>`).join('')}<span class="muted" style="margin-left:auto;font-size:11px">Solo equipo Humand · importado ${h.importedAt ? new Date(h.importedAt).toLocaleDateString('es-AR') : ''}</span></summary>
      <div class="hs-grid">${items.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${h.kickoff ? `<h4>Información del kick-off (AE)</h4><div class="hs-kick">${esc(h.kickoff)}</div>` : ''}
      ${h.url ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">Abrir el deal en HubSpot →</a>` : ''}</details>${rl}`;
  };

  P.summaryHtml = () => {
    const d = st.data; const rows = d.rows;
    const mods = rows.filter(r => r.type === 'module');
    const ints = rows.filter(r => r.type === 'integration');
    const ms = rows.filter(r => r.type === 'milestone');
    const weeks = P.weeks().length;
    const intNames = ints.map(r => r.integration?.name || r.name.replace(/^Integraci[oó]n con /i, ''));
    const firstInt = ints.length ? P.weeks().findIndex(w => ints[0].start >= w.mon && ints[0].start <= w.sun) + 1 : 0;
    const ed = P.editing();
    const cards = [
      [`${weeks} semanas de implementación`, `Ventana de trabajo entre el ${D.short(d.dates.start || P.range().a)} y el lanzamiento${d.dates.golive ? `, la semana del ${D.short(D.monday(d.dates.golive))}` : ''}.`],
      [`${mods.length} módulo${mods.length === 1 ? '' : 's'}${intNames.length ? ' + ' + intNames.join(' + ') : ''}`, `Módulos funcionales escalonados${intNames.length ? ` e integración con ${intNames.join(', ')} corriendo en paralelo${firstInt ? ' desde la semana ' + firstInt : ''}` : ''}.`],
      [`${ms.length} hitos estructurales`, ms.map(m => m.label || m.name).join(' · ') || '—'],
      ['Estructura semanal', null],
    ];
    let html = `<section class="summary">${cards.map((c, i) => `<div class="sum-card"><div class="n">${i + 1}</div><h3>${esc(c[0])}</h3>${c[1] !== null ? `<p>${esc(c[1])}</p>`
      : `<p ${ed ? 'contenteditable="true" data-edit="weeklyText" title="Clic para editar"' : ''}>${esc(d.summary.weeklyText || '')}</p>`}</div>`).join('')}</section>`;

    if (P.show('showProgress')) {
      const all = rows.filter(r => r.type !== 'group');
      const done = all.filter(r => r.done).length;
      const pct = all.length ? Math.round(done / all.length * 100) : 0;
      const left = d.dates.golive ? D.diff(P.today, d.dates.golive) : null;
      const late = all.filter(r => P.rowStatus(r).k === 'late').length;
      const moved = all.filter(r => r.baseEnd && (r.end || r.start) !== r.baseEnd).length;
      html += `<section class="kpis">
        <div class="kpi"><div class="v">${pct}%</div><div class="l">Avance del plan</div><div class="kbar"><span style="width:${pct}%"></span></div></div>
        <div class="kpi"><div class="v">${left === null ? '–' : left >= 0 ? left : '✓'}</div><div class="l">${left === null || left >= 0 ? 'Días para el go-live' : 'Go-live realizado'}</div></div>
        <div class="kpi"><div class="v">${done}<span class="muted" style="font-size:16px"> / ${all.length}</span></div><div class="l">Etapas completadas</div></div>
        <div class="kpi"><div class="v" style="color:${late ? 'var(--err-600)' : moved ? 'var(--warn-700)' : 'var(--ok-700)'}">${late ? late : moved}</div><div class="l">${late ? 'Etapas atrasadas' : 'Cambios de fecha vs. plan original'}</div></div>
      </section>${P.hiddenForClient('showProgress')}`;
    }
    return html;
  };

  // ---------- Gantt ----------
  P.ganttSection = () => `
    <div class="section-title"><h2>Cronograma de implementación</h2><span class="muted">· pasá el cursor sobre las barras para ver el detalle${P.editing() ? ' · arrastrá las barras para mover fechas y ⠿ para reordenar filas' : ''}</span></div>
    <div class="gantt-card">
      <div class="gantt-scroll" id="gscroll"><div class="gantt" id="gantt">${P.ganttInner()}</div></div>
      ${P.ganttFooter()}
    </div>`;

  P.ganttInner = () => {
    const d = st.data; const { a, days } = P.range();
    const W = st.dayW; const LEFT = 250;
    const hol = P.show('showHolidays') ? P.holidays() : [];
    const holSet = new Map(hol.map(h => [h.date, h.name]));
    const weeks = P.weeks();
    const letters = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const ed = P.editing();
    const x = s => D.diff(a, s) * W;

    let head = `<div class="g-head"><div class="g-left">Corriente de trabajo</div><div class="g-weeks"><div class="g-weekrow">`;
    head += weeks.map(w => `<div class="g-week" style="width:${7 * W}px"><b>S${w.i}</b><small>${D.range(w.mon, w.sun)}</small></div>`).join('');
    head += `</div><div class="g-dayrow">`;
    for (let i = 0; i < days; i++) {
      const s = D.add(a, i); const dw = i % 7;
      const cls = [dw >= 5 ? 'we' : '', holSet.has(s) ? 'hol' : '', P.show('showToday') && s === P.today ? 'today' : ''].join(' ');
      head += `<div class="g-day ${cls}" style="width:${W}px" ${holSet.has(s) ? `title="${esc(holSet.get(s))}"` : ''}>${W >= 10 ? letters[dw] : ''}</div>`;
    }
    head += `</div></div></div>`;

    let cols = `<div class="g-cols">`;
    for (let i = 0; i < days; i++) {
      const s = D.add(a, i);
      if (i % 7 === 0) cols += `<div class="g-col wk" style="left:${i * W}px;width:0"></div>`;
      if (holSet.has(s)) cols += `<div class="g-col hol" style="left:${i * W}px;width:${W}px"></div>`;
      else if (i % 7 >= 5) cols += `<div class="g-col we" style="left:${i * W}px;width:${W}px"></div>`;
    }
    if (P.show('showToday') && P.today >= a && D.diff(a, P.today) < days) cols += `<div class="g-today" style="left:${x(P.today) + W / 2 - 1}px"></div>`;
    cols += `</div>`;

    const showProg = P.show('showProgress');
    const body = d.rows.map(r => {
      const stt = P.rowStatus(r);
      const end = r.end || r.start;
      let bars = '';
      if (r.start) {
        if (showProg && P.show('showBaseline') && r.baseStart && (r.baseStart !== r.start || r.baseEnd !== end)) {
          bars += `<div class="ghost-bar" style="left:${x(r.baseStart)}px;width:${(D.diff(r.baseStart, r.baseEnd || r.baseStart) + 1) * W}px" title="Fecha original"></div>`;
        }
        const left = x(r.start); let width = (D.diff(r.start, end) + 1) * W;
        let style = `left:${left}px;width:${width}px`;
        if (r.type === 'golive') { const w2 = Math.max(width, 76); style = `left:${left + W / 2 - w2 / 2}px;width:${w2}px`; }
        const notes = (r.notes || []).filter(n => ed || n.public !== false).length;
        const outside = r.type !== 'golive' && r.label && ((r.label.length + (r.done ? 2 : 0)) * 6.4 + 20) > width;
        bars += `<div class="bar t-${r.type} ${outside ? 'outside' : ''} ${r.done ? 'done' : ''} ${showProg && stt.k === 'late' ? 'late' : ''} ${ed ? 'editable' : ''}" data-bar="${r.id}" style="${style}">
          ${ed && r.type !== 'golive' ? '<i class="rz l" data-rz="l"></i>' : ''}<span>${esc(r.label || '')}</span>${notes ? `<i class="nb">${notes}</i>` : ''}${ed && r.type !== 'golive' ? '<i class="rz r" data-rz="r"></i>' : ''}</div>`;
      }
      const name = r.hc ? `<a href="${esc(r.hc)}" target="_blank" rel="noopener" title="Ver tutorial en el Help Center">${esc(r.name)}</a>` : esc(r.name);
      return `<div class="g-row t-${r.type} ${r.done ? 'is-done' : ''}" data-row="${r.id}">
        <div class="g-left">
          ${ed ? '<span class="handle" title="Arrastrá para reordenar">⠿</span>' : ''}
          <input type="checkbox" class="check" data-done="${r.id}" ${r.done ? 'checked' : ''} ${ed ? '' : 'disabled'} title="${r.done ? 'Completado' : ed ? 'Marcar como completado' : 'Pendiente'}">
          ${showProg ? `<span class="dot ${stt.k}" title="${esc(stt.label)}"></span>` : ''}
          <span class="nm">${name}</span>
          ${ed ? `<span class="acts"><button class="icon-btn" data-note="${r.id}" title="Agregar nota (cambio de fecha, atraso, adelanto)">＋</button><button class="icon-btn" data-editrow="${r.id}" title="Editar">✎</button></span>` : ''}
        </div>
        <div class="g-track" style="width:${days * W}px">${bars}</div>
      </div>`;
    }).join('');

    return head + `<div class="g-body">${cols}${body || '<div class="g-empty">Todavía no hay filas en el cronograma.</div>'}</div>`;
  };

  P.ganttFooter = () => {
    const { a, b } = P.range();
    const hol = P.show('showHolidays') ? P.holidays().filter(h => h.date >= a && h.date <= b) : [];
    const country = (window.CATALOG.COUNTRIES.find(c => c[0] === st.data.holidays.country) || [, ''])[1];
    let html = '';
    html += `<div class="g-legend">
      <span><i style="background:var(--accent)"></i>Configuración</span>
      <span><i style="background:var(--n-700)"></i>Hito</span>
      ${st.data.rows.some(r => r.type === 'integration') ? '<span><i style="background:repeating-linear-gradient(135deg,var(--accent) 0 4px,var(--accent-ink) 4px 8px)"></i>Integración</span>' : ''}
      <span><i style="background:var(--ok-600)"></i>Completado</span>
      ${P.show('showProgress') && P.show('showBaseline') ? '<span><i style="border:1.5px dashed var(--n-400);background:rgba(203,205,214,.18)"></i>Fecha original</span>' : ''}
      ${P.show('showToday') ? '<span><i style="width:2px;height:12px;border-radius:0;background:var(--err-500)"></i>Hoy</span>' : ''}
    </div>`;
    if (P.show('showHolidays') && (hol.length || P.editing())) {
      html += `<div class="g-foot"><b>📅 Feriados nacionales${country ? ` (${esc(country)})` : ''}</b>
        ${hol.map(h => `<span class="h"><i></i><b>${D.short(h.date)}</b> ${esc(h.name)}</span>`).join('') || '<span class="muted">Sin feriados en el período</span>'}
        ${P.hiddenForClient('showHolidays')}</div>`;
    }
    if (P.editing()) {
      html += `<div class="g-actions">
        <button class="btn sm ghost" data-act="add-row">＋ Agregar fila</button>
        <button class="btn sm ghost" data-act="holidays">📅 Feriados y país</button>
        <button class="btn sm ghost" data-act="sort-rows">↕ Ordenar por fecha</button>
        <button class="btn sm quiet" data-act="rebase" title="Toma las fechas actuales como el plan original">Fijar fechas actuales como línea base</button>
      </div>`;
    }
    return html;
  };

  // ancho de cada día según el espacio disponible
  P.computeDayW = () => {
    const { days } = P.range();
    const avail = st.printing ? 1060 - 250 : Math.min(window.innerWidth, 1240) - 48 - 250 - 2;
    st.dayW = Math.max(st.printing ? 6 : 9, Math.floor(avail / days * 10) / 10);
  };

  P.afterRender = (sx) => {
    const sc = P.$('.gantt-scroll');
    if (sc) {
      if (sx !== null && sx !== undefined) sc.scrollLeft = sx;
      else if (P.today > P.range().a && !st.printing) {
        const off = D.diff(P.range().a, P.today) * st.dayW - 200;
        if (off > 0) sc.scrollLeft = off;
      }
    }
    if (P.bind) P.bind();
  };

  // ---------- arranque ----------
  async function boot() {
    try {
      if (SNAP) {
        st.data = migrate(SNAP.data); st.updates = SNAP.updates || []; st.updatesState = 'done';
        st.exportOpts = null; st.canEdit = false;
      } else {
        if (!st.id) throw new Error('Link inválido');
        const [planRes, me] = await Promise.all([P.api(`/api/plan?id=${encodeURIComponent(st.id)}`), P.api('/api/me').catch(() => ({}))]);
        st.data = migrate(planRes.plan.data); st.updatedAt = planRes.plan.updated_at; st.canEdit = planRes.canEdit; st.access = planRes.access || null; st.ownerEmail = planRes.plan.owner_email || null;
        st.user = me.user; st.config = me.config || {};
        if (new URLSearchParams(location.search).has('cliente')) st.preview = true;
      }
      P.computeDayW();
      P.render();
      if (!SNAP && P.loadUpdates) P.loadUpdates();
      if (P.editing() && !st.data.holidays.list.length && P.fetchHolidays) P.fetchHolidays(true);
      if (P.editing() && P.loadReminders) P.loadReminders();
    } catch (e) {
      P.$('#app').innerHTML = `<div class="wrap" style="padding-top:80px"><div class="empty"><h3 style="margin-bottom:8px">No pudimos abrir el plan</h3>${esc(e.message)}</div></div>`;
    }
  }
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!st.data) return; const old = st.dayW; P.computeDayW(); if (old !== st.dayW) P.render(); }, 200); });
  P.boot = boot;
  document.addEventListener('DOMContentLoaded', () => setTimeout(boot));
})();
