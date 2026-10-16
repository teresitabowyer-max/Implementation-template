/* Plan de implementación — interacción: arrastrar, editar, notas, minutas, recordatorios, configuración y exportables. */
(function () {
  const P = window.P; const st = P.st; const esc = P.esc;
  const { D, uid, MODULES, CATS, COUNTRIES } = window.CATALOG;
  const findRow = id => st.data.rows.find(r => r.id === id);
  const ed = () => P.editing();
  const userName = () => st.user?.name || '';

  // ---------- capa de modales ----------
  const layer = document.createElement('div'); layer.id = 'layer'; document.body.appendChild(layer);
  P.openLayer = (html, { center = true, onMount } = {}) => {
    layer.innerHTML = `<div class="backdrop ${center ? 'center' : ''}" data-close-bg>${html}</div>`;
    onMount && onMount(layer.firstElementChild);
    const f = layer.querySelector('input:not([type=checkbox]),textarea,select'); f && setTimeout(() => f.focus(), 30);
  };
  P.closeLayer = () => { layer.innerHTML = ''; };
  layer.addEventListener('mousedown', e => { if (e.target.hasAttribute('data-close-bg')) P.closeLayer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && layer.innerHTML) P.closeLayer(); });
  const val = (root, sel) => root.querySelector(sel)?.value?.trim() ?? '';

  // ---------- tooltip de barras ----------
  const tip = document.createElement('div'); tip.className = 'tip hidden'; document.body.appendChild(tip);
  function showTip(r, ev) {
    const s = P.rowStatus(r); const end = r.end || r.start;
    const notes = (r.notes || []).filter(n => ed() || n.public !== false).slice(-3);
    const kinds = { delay: 'Atraso', advance: 'Adelanto', note: 'Nota' };
    tip.innerHTML = `<b>${esc(r.name)}</b>${r.start === end ? D.long(r.start) : `${D.short(r.start)} → ${D.short(end)} · ${D.diff(r.start, end) + 1} días`}
      ${P.show('showProgress') ? `<div>Estado: <span class="k">${esc(s.label)}</span></div>` : ''}
      ${P.show('showProgress') && r.baseStart && (r.baseStart !== r.start || r.baseEnd !== end) ? `<div>Plan original: ${D.short(r.baseStart)} → ${D.short(r.baseEnd)}</div>` : ''}
      ${r.owner ? `<div>Responsable: ${esc(r.owner)}</div>` : ''}
      ${r.integration?.desc ? `<div>${esc(r.integration.desc)}</div>` : ''}
      ${notes.map(n => `<div class="n"><span class="k">${kinds[n.kind] || 'Nota'} · ${D.short(n.date)}</span> ${esc(n.text)}</div>`).join('')}`;
    tip.classList.remove('hidden'); moveTip(ev);
  }
  function moveTip(ev) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  document.addEventListener('mouseover', e => { const b = e.target.closest('[data-bar]'); if (b && !drag) showTip(findRow(b.dataset.bar), e); });
  document.addEventListener('mousemove', e => { if (!tip.classList.contains('hidden')) { if (e.target.closest('[data-bar]') && !drag) moveTip(e); else tip.classList.add('hidden'); } });

  // ---------- arrastrar barras (mover / estirar) ----------
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-bar]');
    if (!b || !ed() || e.button !== 0) return;
    const r = findRow(b.dataset.bar);
    drag = { el: b, r, mode: e.target.dataset.rz || 'move', x0: e.clientX, s0: r.start, e0: r.end || r.start, left0: b.offsetLeft, w0: b.offsetWidth, moved: false, dd: 0 };
    b.setPointerCapture(e.pointerId); tip.classList.add('hidden'); e.preventDefault();
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0; const W = st.dayW;
    if (Math.abs(dx) > 3) drag.moved = true;
    const dd = Math.round(dx / W); drag.dd = dd;
    if (drag.mode === 'move') drag.el.style.left = (drag.left0 + dd * W) + 'px';
    else if (drag.mode === 'r') drag.el.style.width = Math.max(W, drag.w0 + dd * W) + 'px';
    else { const nd = Math.min(dd, D.diff(drag.s0, drag.e0)); drag.el.style.left = (drag.left0 + nd * W) + 'px'; drag.el.style.width = (drag.w0 - nd * W) + 'px'; }
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const { r, mode, dd, moved, s0, e0 } = drag; drag = null;
    if (!moved) return openRow(r.id);
    if (!dd) return P.render();
    if (mode === 'move') { r.start = D.add(s0, dd); r.end = D.add(e0, dd); }
    else if (mode === 'r') r.end = D.add(e0, Math.max(dd, -D.diff(s0, e0)));
    else r.start = D.add(s0, Math.min(dd, D.diff(s0, e0)));
    if (r.type === 'golive') { r.end = r.start; st.data.dates.golive = r.start; }
    P.save(); P.render();
    const delta = D.diff(e0, r.end || r.start);
    const msg = delta ? `${r.name}: ${delta > 0 ? '+' : ''}${delta} día${Math.abs(delta) === 1 ? '' : 's'}` : `${r.name}: fechas actualizadas`;
    P.toast(msg, '＋ Agregar nota del cambio', () => openNote(r.id, { kind: delta > 0 ? 'delay' : delta < 0 ? 'advance' : 'note', from: { start: s0, end: e0 } }));
  });

  // ---------- reordenar filas ----------
  let dragRow = null;
  document.addEventListener('mousedown', e => { const h = e.target.closest('.handle'); if (h && ed()) h.closest('.g-row').draggable = true; });
  document.addEventListener('dragstart', e => { const row = e.target.closest?.('.g-row'); if (!row || !row.draggable) return; dragRow = row.dataset.row; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragRow); } catch {} });
  document.addEventListener('dragover', e => {
    if (!dragRow) return; const row = e.target.closest('.g-row'); if (!row) return;
    e.preventDefault();
    document.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    const rc = row.getBoundingClientRect(); row.classList.add(e.clientY < rc.top + rc.height / 2 ? 'drop-before' : 'drop-after');
  });
  document.addEventListener('drop', e => {
    if (!dragRow) return; const row = e.target.closest('.g-row'); e.preventDefault();
    if (row && row.dataset.row !== dragRow) {
      const rows = st.data.rows; const from = rows.findIndex(r => r.id === dragRow);
      const [it] = rows.splice(from, 1);
      let to = rows.findIndex(r => r.id === row.dataset.row);
      if (row.classList.contains('drop-after')) to++;
      rows.splice(to, 0, it); P.save();
    }
    dragRow = null; P.render();
  });
  document.addEventListener('dragend', () => { if (dragRow) { dragRow = null; P.render(); } });

  // ---------- clics ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act],[data-tab],[data-note],[data-editrow],[data-minuta],[data-delminuta],[data-remind],[data-hideupd],[data-editupd]');
    if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; P.render(); window.scrollTo({ top: 0 }); return; }
    if (t.dataset.note) return openNote(t.dataset.note);
    if (t.dataset.editrow) return openRow(t.dataset.editrow);
    if (t.dataset.minuta) return openMinuta(t.dataset.minuta);
    if (t.dataset.delminuta) { if (confirm('¿Eliminar esta minuta y sus tareas?')) { st.data.minutas = st.data.minutas.filter(m => m.id !== t.dataset.delminuta); P.save(); P.render(); } return; }
    if (t.dataset.remind) { const [m, k] = t.dataset.remind.split(':'); return openReminder(m, k); }
    if (t.dataset.hideupd) { const h = st.data.updates.hidden; const i = h.indexOf(t.dataset.hideupd); i >= 0 ? h.splice(i, 1) : h.push(t.dataset.hideupd); P.save(); P.render(); return; }
    if (t.dataset.editupd) return openUpdate(t.dataset.editupd);
    const a = t.dataset.act;
    if (!a) return;
    e.preventDefault();
    const acts = {
      preview: () => { st.preview = !st.preview; P.render(); window.scrollTo({ top: 0 }); },
      'copy-link': () => { const u = `${location.origin}/p/${st.id}`; navigator.clipboard?.writeText(u).then(() => P.toast('Link del cliente copiado. Solo puede ver, no editar.'), () => prompt('Link del cliente:', u)); },
      config: openConfig, export: openExport, share: openShare, history: openHistory, 'add-row': openAddRow, holidays: openHolidays, 'add-integration': () => openAddRow('integration'),
      'sort-rows': () => { const order = { milestone: 0, module: 1, integration: 1, custom: 1, golive: 2 }; st.data.rows.sort((x, y) => (x.start || '').localeCompare(y.start || '') || (order[x.type] - order[y.type])); P.save(); P.render(); },
      rebase: () => { if (!confirm('Las fechas actuales pasan a ser el plan original (se borran las barras punteadas). ¿Continuar?')) return; st.data.rows.forEach(r => { r.baseStart = r.start; r.baseEnd = r.end || r.start; }); P.save(); P.render(); },
      'new-minuta': () => openMinuta(null), digest: openDigest, 'add-update': () => openUpdate(null),
      reload: P.reloadFromServer, force: P.forceSave,
      'print-client': () => doPrint({ ...st.data.settings }),
    };
    acts[a] && acts[a]();
  });

  // ---------- cambios en línea (checkbox, contenteditable, agenda) ----------
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.done && ed()) { const r = findRow(t.dataset.done); r.done = t.checked; r.doneAt = t.checked ? P.today : null; P.save(); P.render(); }
    if (t.dataset.task && ed()) {
      const [mid, tid] = t.dataset.task.split(':'); const m = st.data.minutas.find(x => x.id === mid); const k = m.tasks.find(x => x.id === tid);
      k.done = t.checked; k.doneAt = t.checked ? P.today : null; P.save(); P.render();
    }
    if (t.hasAttribute('data-upd-days')) { st.data.updates.days = Number(t.value); P.save(); P.loadUpdates(); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.ag && ed()) { const [mon, k] = t.dataset.ag.split('.'); st.data.agenda[mon] = { ...(st.data.agenda[mon] || {}), [k]: t.value }; P.save(); }
  });
  document.addEventListener('focusout', e => {
    const t = e.target; if (!ed() || !t.isContentEditable) return;
    const txt = t.innerText.trim();
    if (t.dataset.edit === 'weeklyText') st.data.summary.weeklyText = txt;
    else if (t.dataset.ded) st.data.dedication[t.dataset.ded] = t.dataset.ded === 'percent' ? txt.replace(/[^\d]/g, '') : txt;
    else if (t.dataset.ph) { const [i, k] = t.dataset.ph.split('.'); st.data.dedication.phases[i][k] = txt; }
    else return;
    P.save();
  });

  P.bind = () => {};

  // ---------- editar fila ----------
  function openRow(id) {
    const r = findRow(id); if (!r) return;
    const typeOpts = { module: 'Módulo', milestone: 'Hito', integration: 'Integración', custom: 'Otra tarea', golive: 'Go-live' };
    const kinds = { delay: 'Atraso', advance: 'Adelanto', note: 'Nota' };
    P.openLayer(`<div class="drawer" role="dialog" aria-label="Editar fila">
      <header><h3>Editar etapa</h3><button class="icon-btn" data-x>✕</button></header>
      <label class="field"><span>Nombre (columna izquierda)</span><input class="input" id="f-name" value="${esc(r.name)}"></label>
      <label class="field"><span>Texto dentro de la barra</span><input class="input" id="f-label" value="${esc(r.label || '')}"></label>
      <div class="grid2">
        <label class="field"><span>Inicio</span><input type="date" class="input" id="f-start" value="${r.start || ''}"></label>
        <label class="field"><span>Fin</span><input type="date" class="input" id="f-end" value="${r.end || r.start || ''}" ${r.type === 'golive' ? 'disabled' : ''}></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Tipo</span><select class="input" id="f-type">${Object.entries(typeOpts).map(([k, v]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Responsable</span><input class="input" id="f-owner" value="${esc(r.owner || '')}" placeholder="Ej.: Ana (RR. HH.)"></label>
      </div>
      ${r.type === 'integration' ? `<div class="grid2"><label class="field"><span>Sistema</span><input class="input" id="f-iname" value="${esc(r.integration?.name || '')}" placeholder="SAP"></label>
        <label class="field"><span>Tipo de integración</span><input class="input" id="f-itype" value="${esc(r.integration?.type || '')}" placeholder="API, SFTP, SSO…"></label></div>
        <label class="field"><span>Descripción</span><textarea class="input" id="f-idesc" rows="2">${esc(r.integration?.desc || '')}</textarea></label>` : ''}
      ${r.type === 'module' ? `<label class="field"><span>Link del Help Center</span><input class="input" id="f-hc" value="${esc(r.hc || '')}"></label>` : ''}
      <label class="switch"><input type="checkbox" id="f-done" ${r.done ? 'checked' : ''}> Completado (se pinta de verde)</label>
      <div class="muted" style="font-size:12px">Plan original: ${r.baseStart ? `${D.dmy(r.baseStart)} → ${D.dmy(r.baseEnd)}` : '—'} <a href="#" data-rebase-one>Usar fechas actuales como originales</a></div>
      <h4>Notas y cambios de fecha</h4>
      <div style="display:flex;flex-direction:column;gap:6px">${(r.notes || []).slice().reverse().map(n => `<div class="note"><span class="chip ${n.kind === 'delay' ? 'err' : n.kind === 'advance' ? 'ok' : ''} kind">${kinds[n.kind] || 'Nota'}</span>
        <div style="flex:1"><p>${esc(n.text)}</p><div class="when">${D.dmy(n.date)}${n.author ? ' · ' + esc(n.author) : ''}${n.from ? ` · ${D.short(n.from.end)} → ${D.short(n.to?.end || '')}` : ''}${n.public === false ? ' · solo interno' : ''}</div></div>
        <button class="icon-btn" data-delnote="${n.id}">🗑</button></div>`).join('') || '<div class="muted" style="font-size:13px">Sin notas.</div>'}</div>
      <button class="btn ghost sm" data-addnote style="align-self:flex-start">＋ Agregar nota</button>
      <footer><button class="btn danger" data-delrow>Eliminar fila</button><span style="flex:1"></span><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Guardar</button></footer>
    </div>`, {
      center: false, onMount: root => {
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('[data-addnote]').onclick = () => { apply(root, r, true); openNote(r.id); };
        root.querySelector('[data-rebase-one]').onclick = ev => { ev.preventDefault(); apply(root, r, true); r.baseStart = r.start; r.baseEnd = r.end || r.start; P.save(); P.render(); openRow(r.id); };
        root.querySelectorAll('[data-delnote]').forEach(b => b.onclick = () => { r.notes = r.notes.filter(n => n.id !== b.dataset.delnote); P.save(); P.render(); openRow(r.id); });
        root.querySelector('[data-delrow]').onclick = () => { if (!confirm(`¿Eliminar "${r.name}" del cronograma?`)) return; st.data.rows = st.data.rows.filter(x => x.id !== r.id); P.save(); P.closeLayer(); P.render(); };
        root.querySelector('[data-ok]').onclick = () => {
          const prev = { start: r.start, end: r.end || r.start };
          apply(root, r); P.closeLayer();
          const delta = D.diff(prev.end, r.end || r.start);
          if (prev.start !== r.start || prev.end !== (r.end || r.start)) P.toast(`${r.name}: fechas actualizadas`, '＋ Agregar nota del cambio', () => openNote(r.id, { kind: delta > 0 ? 'delay' : delta < 0 ? 'advance' : 'note', from: prev }));
        };
      },
    });
  }
  function apply(root, r, silent) {
    r.name = val(root, '#f-name') || r.name; r.label = val(root, '#f-label');
    r.start = val(root, '#f-start') || r.start; r.end = r.type === 'golive' ? r.start : (val(root, '#f-end') || r.end);
    if (r.end < r.start) r.end = r.start;
    r.type = val(root, '#f-type') || r.type; r.owner = val(root, '#f-owner');
    r.done = root.querySelector('#f-done').checked; if (r.done && !r.doneAt) r.doneAt = P.today;
    if (root.querySelector('#f-iname')) r.integration = { ...(r.integration || {}), name: val(root, '#f-iname'), type: val(root, '#f-itype'), desc: val(root, '#f-idesc') };
    if (root.querySelector('#f-hc')) r.hc = val(root, '#f-hc');
    if (r.type === 'golive') st.data.dates.golive = r.start;
    P.save(); if (!silent) P.render(); else P.render();
  }

  // ---------- nota (el "+") ----------
  function openNote(id, pre = {}) {
    const r = findRow(id); if (!r) return;
    const from = pre.from || (r.baseStart ? { start: r.baseStart, end: r.baseEnd } : null);
    P.openLayer(`<div class="modal" role="dialog" aria-label="Agregar nota">
      <header><h3>Nota · ${esc(r.name)}</h3><button class="icon-btn" data-x>✕</button></header>
      <div class="row">${[['delay', 'Atraso'], ['advance', 'Adelanto'], ['note', 'Nota']].map(([k, v]) => `<label class="chip" style="cursor:pointer;padding:6px 12px"><input type="radio" name="nk" value="${k}" ${((pre.kind || 'note') === k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      ${from && (from.end !== (r.end || r.start)) ? `<div class="muted" style="font-size:13px">Cambio de fecha: ${D.dmy(from.end)} → <b>${D.dmy(r.end || r.start)}</b></div>` : ''}
      <label class="field"><span>¿Qué pasó?</span><textarea class="input" id="n-text" rows="3" placeholder="Ej.: El cliente necesita validar la estructura del organigrama con Dirección. Se corre una semana."></textarea></label>
      <label class="switch"><input type="checkbox" id="n-public" checked> Visible para el cliente</label>
      <footer><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Agregar nota</button></footer></div>`, {
      onMount: root => {
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('[data-ok]').onclick = () => {
          const text = val(root, '#n-text'); if (!text) return root.querySelector('#n-text').focus();
          r.notes = r.notes || [];
          r.notes.push({ id: uid(), date: P.today, kind: root.querySelector('input[name=nk]:checked').value, text, public: root.querySelector('#n-public').checked, author: userName(), from: from || null, to: { start: r.start, end: r.end || r.start } });
          P.save(); P.closeLayer(); P.render(); P.toast('Nota agregada');
        };
      },
    });
  }

  // ---------- agregar fila ----------
  function openAddRow(preset) {
    const used = new Set(st.data.rows.map(r => r.key));
    const avail = MODULES.filter(m => !used.has(m.key));
    P.openLayer(`<div class="modal" role="dialog" aria-label="Agregar fila">
      <header><h3>Agregar al cronograma</h3><button class="icon-btn" data-x>✕</button></header>
      <label class="field"><span>Tipo</span><select class="input" id="a-type">
        <option value="module" ${preset ? '' : 'selected'}>Módulo de Humand</option><option value="integration" ${preset === 'integration' ? 'selected' : ''}>Integración (SAP, nómina, SSO…)</option>
        <option value="milestone">Hito</option><option value="custom">Otra tarea</option></select></label>
      <label class="field" id="a-modw"><span>Módulo</span><select class="input" id="a-mod">${CATS.map(c => `<optgroup label="${esc(c)}">${avail.filter(m => m.cat === c).map(m => `<option value="${m.key}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="field hidden" id="a-namew"><span>Nombre</span><input class="input" id="a-name" placeholder="Ej.: SAP SuccessFactors"></label>
      <label class="field hidden" id="a-descw"><span>Descripción (se muestra al cliente)</span><textarea class="input" id="a-desc" rows="2" placeholder="Sincronización de altas, bajas y estructura desde SAP."></textarea></label>
      <div class="grid2"><label class="field"><span>Inicio</span><input type="date" class="input" id="a-start" value="${D.add(st.data.dates.start || P.today, 14)}"></label>
        <label class="field"><span>Fin</span><input type="date" class="input" id="a-end" value="${D.add(st.data.dates.start || P.today, 32)}"></label></div>
      <footer><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Agregar</button></footer></div>`, {
      onMount: root => {
        const sync = () => { const t = val(root, '#a-type'); root.querySelector('#a-modw').classList.toggle('hidden', t !== 'module'); root.querySelector('#a-namew').classList.toggle('hidden', t === 'module'); root.querySelector('#a-descw').classList.toggle('hidden', t !== 'integration'); root.querySelector('#a-name').placeholder = t === 'integration' ? 'Ej.: SAP' : 'Nombre'; };
        root.querySelector('#a-type').onchange = sync; sync();
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('[data-ok]').onclick = () => {
          const type = val(root, '#a-type'); const start = val(root, '#a-start'); let end = val(root, '#a-end'); if (end < start) end = start;
          let row;
          if (type === 'module') { const m = MODULES.find(x => x.key === val(root, '#a-mod')); if (!m) return; row = { type, key: m.key, name: m.name, cat: m.cat, hc: m.hc, label: 'Configuración' }; st.data.stage2 = st.data.stage2.filter(k => k !== m.key); }
          else { const name = val(root, '#a-name'); if (!name) return root.querySelector('#a-name').focus(); row = type === 'integration' ? { type, name: `Integración con ${name}`, label: 'Trabajo en paralelo · sincronización continua', integration: { name, desc: val(root, '#a-desc') } } : { type, name, label: type === 'milestone' ? name : '' }; }
          Object.assign(row, { id: uid(), start, end, baseStart: start, baseEnd: end, done: false, owner: '', notes: [] });
          const qa = st.data.rows.findIndex(r => r.key === 'qa');
          st.data.rows.splice(qa >= 0 ? qa : st.data.rows.length, 0, row);
          P.save(); P.closeLayer(); P.render(); if (type === 'module') P.loadUpdates();
        };
      },
    });
  }

  // ---------- feriados ----------
  P.fetchHolidays = async (silent) => {
    const { a, b } = P.range();
    const years = [...new Set([D.parse(a).getUTCFullYear(), D.parse(b).getUTCFullYear()])].join(',');
    try {
      const j = await P.api(`/api/holidays?country=${st.data.holidays.country}&years=${years}`);
      st.data.holidays.list = j.holidays; P.save(); P.render();
      if (!silent) P.toast(j.source === 'fallback' ? 'Feriados cargados (lista de respaldo: revisalos)' : 'Feriados actualizados');
    } catch (e) { if (!silent) P.toast('No se pudieron cargar los feriados: ' + e.message); }
  };
  function openHolidays() {
    const h = st.data.holidays; const { a, b } = P.range();
    const inRange = [...h.list, ...h.custom.map(c => ({ ...c, custom: true }))].filter(x => x.date >= a && x.date <= b).sort((x, y) => x.date.localeCompare(y.date));
    P.openLayer(`<div class="modal" role="dialog" aria-label="Feriados">
      <header><h3>Feriados del cronograma</h3><button class="icon-btn" data-x>✕</button></header>
      <div class="row"><label class="field" style="flex:1"><span>País del cliente</span><select class="input" id="h-country">${COUNTRIES.map(([k, v]) => `<option value="${k}" ${h.country === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <button class="btn ghost" data-reload style="align-self:flex-end">Cargar feriados</button></div>
      <p class="muted" style="font-size:13px">Destildá los que no quieras mostrar. También podés sumar días no laborables propios del cliente.</p>
      <div style="display:flex;flex-direction:column;gap:6px">${inRange.map(x => `<label class="row" style="gap:10px"><input type="checkbox" class="check" data-h="${x.date}" ${h.hidden.includes(x.date) ? '' : 'checked'}><b style="width:90px">${D.dmy(x.date)}</b><span style="flex:1">${esc(x.name)}</span>${x.custom ? `<button class="icon-btn" data-delh="${x.date}">🗑</button>` : ''}</label>`).join('') || '<div class="muted">No hay feriados en el período del plan.</div>'}</div>
      <h4>Agregar día no laborable</h4>
      <div class="row"><input type="date" class="input" id="h-date" style="width:170px"><input class="input" id="h-name" placeholder="Ej.: Día del empleado de comercio" style="flex:1"><button class="btn ghost" data-addh>Agregar</button></div>
      <footer><button class="btn" data-x>Listo</button></footer></div>`, {
      onMount: root => {
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { P.closeLayer(); P.render(); });
        root.querySelector('#h-country').onchange = e => { h.country = e.target.value; st.data.client.country = e.target.value; h.list = []; P.fetchHolidays().then(openHolidays); };
        root.querySelector('[data-reload]').onclick = () => P.fetchHolidays().then(openHolidays);
        root.querySelectorAll('[data-h]').forEach(c => c.onchange = () => { const d = c.dataset.h; h.hidden = h.hidden.filter(x => x !== d); if (!c.checked) h.hidden.push(d); P.save(); });
        root.querySelectorAll('[data-delh]').forEach(b => b.onclick = () => { h.custom = h.custom.filter(x => x.date !== b.dataset.delh); P.save(); openHolidays(); });
        root.querySelector('[data-addh]').onclick = () => { const date = val(root, '#h-date'), name = val(root, '#h-name'); if (!date || !name) return; h.custom.push({ date, name }); P.save(); openHolidays(); };
      },
    });
  }

  // ---------- minutas ----------
  // Detecta tareas en un texto pegado: viñetas, casillas, "Acción:", verbos de tarea; responsable con @, "Resp.:" o paréntesis; fecha dd/mm.
  P.parseMinuta = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const tasks = []; const summary = [];
    const verbs = /^(enviar|definir|compartir|cargar|validar|revisar|confirmar|armar|subir|preparar|coordinar|agendar|completar|configurar|relevar|actualizar|crear|mandar|pasar|verificar|probar|aprobar|documentar|solicitar|chequear)\b/i;
    let inTasks = false;
    for (const raw of lines) {
      if (/^(pr[oó]ximos pasos|tareas|action items|acciones|pendientes|to ?do)\s*:?$/i.test(raw.replace(/[#*_]/g, '').trim())) { inTasks = true; continue; }
      if (/^#{1,6}\s/.test(raw) || /^[A-ZÁÉÍÓÚÑ][^.:]{2,40}:$/.test(raw)) inTasks = false;
      const bullet = /^([-*•·▪◦]|\[ ?\]|\[x\]|☐|☑|✅|\d+[.)])\s*/i.test(raw);
      let l = raw.replace(/^([-*•·▪◦]|\[ ?\]|\[x\]|☐|☑|✅|\d+[.)])\s*/i, '').replace(/^\*\*|\*\*$/g, '');
      const tagged = /^(acci[oó]n|tarea|pendiente|to ?do|ai)\s*[:\-–]\s*/i.test(l);
      l = l.replace(/^(acci[oó]n|tarea|pendiente|to ?do|ai)\s*[:\-–]\s*/i, '');
      if (tagged || (bullet && (inTasks || verbs.test(l))) || verbs.test(l) || /\b(responsable|resp\.)\s*:/i.test(l)) {
        let owner = '', due = '';
        const mOwner = l.match(/@([\wÁÉÍÓÚÑáéíóúñ.]+(?:\s[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/) || l.match(/\b(?:responsable|resp\.?|a cargo de)\s*:?\s*([^,;()\-–]+?)(?=\s*(?:[,;()\-–]|para|antes|$))/i) || l.match(/\(([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)\)\s*$/) || l.match(/\s[–—-]\s([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)\s*$/);
        if (mOwner) { owner = mOwner[1].trim(); l = l.replace(mOwner[0], ' '); }
        const mDate = l.match(/(?:para el|antes del?|hasta el|fecha:?|vence:?|el)?\s*(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/i);
        if (mDate) {
          const y = mDate[3] ? (mDate[3].length === 2 ? '20' + mDate[3] : mDate[3]) : P.today.slice(0, 4);
          const dd = String(mDate[1]).padStart(2, '0'), mm = String(mDate[2]).padStart(2, '0');
          if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) { due = `${y}-${mm}-${dd}`; l = l.replace(mDate[0], ' '); }
        }
        l = l.replace(/\(\s*\)/g, ' ').replace(/\s{2,}/g, ' ').replace(/[\s,;:\-–]+$/, '').trim();
        if (l) tasks.push({ id: uid(), text: l.charAt(0).toUpperCase() + l.slice(1), owner, email: '', due, done: /^(\[x\]|☑|✅)/i.test(raw) });
      } else summary.push(raw.replace(/^([-*•·▪◦]|\d+[.)])\s*/, '• '));
    }
    return { tasks, summary: summary.join('\n') };
  };

  function openMinuta(id) {
    const existing = id ? st.data.minutas.find(m => m.id === id) : null;
    const m = existing ? structuredClone(existing) : { id: uid(), date: P.today, title: '', summary: '', tasks: [] };
    const contacts = st.data.client.contacts || [];
    const taskRow = t => `<div class="task-edit" data-tid="${t.id}">
      <input class="input" data-k="text" value="${esc(t.text)}" placeholder="Tarea">
      <input class="input" data-k="owner" value="${esc(t.owner || '')}" placeholder="Responsable" list="contacts-dl">
      <input class="input" type="date" data-k="due" value="${t.due || ''}">
      <button class="icon-btn" data-deltask title="Quitar">✕</button></div>`;
    const draw = () => P.openLayer(`<div class="modal" style="width:min(760px,100%)" role="dialog" aria-label="Minuta">
      <header><h3>${existing ? 'Editar minuta' : 'Nueva minuta'}</h3><button class="icon-btn" data-x>✕</button></header>
      <div class="grid2"><label class="field"><span>Fecha de la reunión</span><input type="date" class="input" id="m-date" value="${m.date || ''}"></label>
        <label class="field"><span>Título</span><input class="input" id="m-title" value="${esc(m.title)}" placeholder="Ej.: S3 · Organigrama y comunicación interna"></label></div>
      <label class="field"><span>Pegá la minuta (Granola, Notion, Meet, mail…)</span><textarea class="input" id="m-raw" rows="6" placeholder="Resumen de la reunión…&#10;&#10;Próximos pasos:&#10;- Enviar estructura de áreas @Laura para el 15/10&#10;- Validar textos de bienvenida (Responsable: Martín)"></textarea></label>
      <div class="row"><button class="btn ghost sm" data-parse>✨ Detectar tareas en el texto</button><span class="muted" style="font-size:12px">Detecta viñetas, "Acción:", verbos (enviar, validar…), @responsable y fechas dd/mm.</span></div>
      <label class="field"><span>Resumen (lo ve el cliente)</span><textarea class="input" id="m-sum" rows="4">${esc(m.summary)}</textarea></label>
      <h4>Tareas</h4>
      <datalist id="contacts-dl">${contacts.map(c => `<option value="${esc(c.name)}">`).join('')}${st.data.humand?.name ? `<option value="${esc(st.data.humand.name)}">` : ''}</datalist>
      <div id="m-tasks" style="display:flex;flex-direction:column;gap:6px">${m.tasks.map(taskRow).join('') || '<div class="muted" style="font-size:13px">Sin tareas todavía.</div>'}</div>
      <button class="btn ghost sm" data-addtask style="align-self:flex-start">＋ Agregar tarea</button>
      <footer><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Guardar minuta</button></footer></div>`, {
      onMount: root => {
        const collect = () => {
          m.date = val(root, '#m-date'); m.title = val(root, '#m-title'); m.summary = root.querySelector('#m-sum').value;
          root.querySelectorAll('[data-tid]').forEach(el => { const t = m.tasks.find(x => x.id === el.dataset.tid); el.querySelectorAll('[data-k]').forEach(i => t[i.dataset.k] = i.value.trim()); });
          m.tasks = m.tasks.filter(t => t.text);
          m.tasks.forEach(t => { const c = contacts.find(c => c.name && c.name.toLowerCase() === (t.owner || '').toLowerCase()); if (c && !t.email) t.email = c.email; });
        };
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('[data-parse]').onclick = () => {
          collect(); const raw = root.querySelector('#m-raw').value; if (!raw.trim()) return;
          const out = P.parseMinuta(raw);
          m.tasks.push(...out.tasks); if (!m.summary.trim()) m.summary = out.summary;
          if (!m.title) { const first = raw.split('\n').find(l => l.trim()); if (first && first.length < 80) m.title = first.replace(/^#+\s*/, ''); }
          draw(); P.toast(`${out.tasks.length} tarea${out.tasks.length === 1 ? '' : 's'} detectada${out.tasks.length === 1 ? '' : 's'}`);
        };
        root.querySelector('[data-addtask]').onclick = () => { collect(); m.tasks.push({ id: uid(), text: ' ', owner: '', due: '', done: false }); draw(); const ins = layer.querySelectorAll('[data-k=text]'); ins[ins.length - 1]?.focus(); };
        root.querySelectorAll('[data-deltask]').forEach(b => b.onclick = () => { collect(); m.tasks = m.tasks.filter(t => t.id !== b.closest('[data-tid]').dataset.tid); draw(); });
        root.querySelector('[data-ok]').onclick = () => {
          collect();
          if (existing) Object.assign(existing, m); else st.data.minutas.push(m);
          P.save(); P.closeLayer(); st.tab = 'minutas'; P.render();
          if (m.tasks.some(t => !t.done && t.due)) P.toast('Minuta guardada', '🔔 Programar recordatorio', () => openReminder(m.id, null));
          else P.toast('Minuta guardada');
        };
      },
    });
    draw();
  }

  // ---------- recordatorios por mail ----------
  P.loadReminders = async () => {
    try { const j = await P.api(`/api/reminders?plan=${encodeURIComponent(st.id)}`); st.reminders = j.reminders || []; if (st.tab === 'minutas') P.render(); } catch { }
  };
  function openReminder(mid, tid) {
    const m = st.data.minutas.find(x => x.id === mid);
    const tasks = tid ? m.tasks.filter(t => t.id === tid) : m.tasks.filter(t => !t.done);
    const contacts = st.data.client.contacts || [];
    const emails = [...new Set(tasks.map(t => t.email).filter(Boolean))];
    const to = emails.length ? emails : contacts.map(c => c.email).filter(Boolean);
    const due = tasks.map(t => t.due).filter(Boolean).sort()[0];
    const dayBefore = due ? D.add(due, -1) : '';
    const existing = st.reminders.filter(r => (r.task_id || '').split(',').some(x => tasks.some(t => t.id === x)));
    P.openLayer(`<div class="modal" role="dialog" aria-label="Recordatorio">
      <header><h3>🔔 Recordatorio por mail</h3><button class="icon-btn" data-x>✕</button></header>
      <div class="muted" style="font-size:13px">${tasks.length === 1 ? esc(tasks[0].text) : `${tasks.length} tareas pendientes de "${esc(m.title || 'la minuta')}"`}. El mail incluye solo las que sigan pendientes al momento del envío.</div>
      <label class="field"><span>Para (separá con coma)</span><input class="input" id="r-to" value="${esc(to.join(', '))}" placeholder="mail@cliente.com"></label>
      ${contacts.length ? `<div class="row" style="gap:6px">${contacts.filter(c => c.email).map(c => `<button class="chip" data-addto="${esc(c.email)}" style="border:0;cursor:pointer">＋ ${esc(c.name || c.email)}</button>`).join('')}</div>` : ''}
      <label class="field"><span>CC</span><input class="input" id="r-cc" value="${esc(st.user?.email || '')}"></label>
      <label class="field"><span>Mensaje (opcional)</span><textarea class="input" id="r-intro" rows="2" placeholder="¡Hola! Te recordamos las tareas acordadas en la última reunión."></textarea></label>
      <h4>¿Cuándo?</h4>
      <label class="row" style="gap:8px"><input type="radio" name="when" value="before" ${dayBefore && dayBefore >= P.today ? 'checked' : 'disabled'}> Automático: 1 día antes del vencimiento ${dayBefore ? `(${D.dmy(dayBefore)}, 9:00)` : '(la tarea no tiene fecha)'}</label>
      <label class="row" style="gap:8px"><input type="radio" name="when" value="date" ${dayBefore && dayBefore >= P.today ? '' : 'checked'}> Elegir fecha: <input type="date" class="input" id="r-date" style="width:160px" value="${D.add(P.today, 1)}"> <input type="time" class="input" id="r-time" style="width:110px" value="09:00"></label>
      <label class="row" style="gap:8px"><input type="radio" name="when" value="now"> Enviar ahora</label>
      ${existing.length ? `<h4>Ya programados</h4>${existing.map(r => `<div class="note"><span class="chip ${r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'err' : 'warn'}">${{ scheduled: 'Programado', sent: 'Enviado', failed: 'Falló', skipped: 'Omitido' }[r.status] || r.status}</span><div style="flex:1;font-size:13px">${D.dmy(r.send_at.slice(0, 10))} ${new Date(r.send_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · ${esc((r.recipients || []).join(', '))}${r.error ? `<div class="when">${esc(r.error)}</div>` : ''}</div>${r.status === 'scheduled' ? `<button class="icon-btn" data-delrem="${r.id}">🗑</button>` : ''}</div>`).join('')}` : ''}
      ${st.config.mail === false ? '<div class="chip err">El envío de mails todavía no está configurado (RESEND_API_KEY).</div>' : ''}
      <footer><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Programar</button></footer></div>`, {
      onMount: root => {
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelectorAll('[data-addto]').forEach(b => b.onclick = () => { const i = root.querySelector('#r-to'); const cur = i.value.split(/[,;]/).map(s => s.trim()).filter(Boolean); if (!cur.includes(b.dataset.addto)) cur.push(b.dataset.addto); i.value = cur.join(', '); });
        root.querySelectorAll('[data-delrem]').forEach(b => b.onclick = async () => { await P.api(`/api/reminders?id=${b.dataset.delrem}&plan=${encodeURIComponent(st.id)}`, { method: 'DELETE' }); await P.loadReminders(); openReminder(mid, tid); });
        const btn = root.querySelector('[data-ok]');
        const upd = () => { btn.textContent = root.querySelector('input[name=when]:checked')?.value === 'now' ? 'Enviar ahora' : 'Programar'; };
        root.querySelectorAll('input[name=when]').forEach(r => r.onchange = upd); upd();
        btn.onclick = async () => {
          const when = root.querySelector('input[name=when]:checked')?.value;
          let sendAt = null;
          if (when === 'before') sendAt = new Date(`${dayBefore}T09:00:00`).toISOString();
          if (when === 'date') sendAt = new Date(`${val(root, '#r-date')}T${val(root, '#r-time') || '09:00'}:00`).toISOString();
          btn.disabled = true;
          try {
            await P.api('/api/reminders', { method: 'POST', body: { plan: st.id, taskIds: tasks.map(t => t.id), to: val(root, '#r-to'), cc: val(root, '#r-cc'), intro: val(root, '#r-intro'), sendAt, sendNow: when === 'now', kind: 'task', subject: `Recordatorio · ${tasks.length === 1 ? tasks[0].text.slice(0, 60) : 'Tareas del plan de implementación ' + st.data.client.name}` } });
            P.closeLayer(); await P.loadReminders(); P.render();
            P.toast(when === 'now' ? 'Mail enviado ✓' : `Recordatorio programado para el ${D.dmy(sendAt.slice(0, 10))}`);
          } catch (e) { btn.disabled = false; alert(e.message); }
        };
      },
    });
  }

  function openDigest() {
    const dg = st.data.settings.digest;
    const days = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
    P.openLayer(`<div class="modal" role="dialog" aria-label="Resumen semanal">
      <header><h3>✉ Resumen semanal automático</h3><button class="icon-btn" data-x>✕</button></header>
      <p class="muted" style="font-size:13px">Una vez por semana se envía un mail con las tareas pendientes de las minutas y lo que está en curso en el cronograma esa semana. Si no hay pendientes, avisa que están al día.</p>
      <label class="switch"><input type="checkbox" id="d-on" ${dg.on ? 'checked' : ''}> Activar resumen semanal</label>
      <label class="field"><span>Día de envío (9 a 10 h aprox.)</span><select class="input" id="d-day">${[1, 2, 3, 4, 5].map(i => `<option value="${i}" ${Number(dg.weekday) === i ? 'selected' : ''}>${days[i]}</option>`).join('')}</select></label>
      <label class="field"><span>Para</span><input class="input" id="d-to" value="${esc((dg.to || []).join(', ') || (st.data.client.contacts || []).map(c => c.email).filter(Boolean).join(', '))}"></label>
      <label class="field"><span>CC</span><input class="input" id="d-cc" value="${esc((dg.cc || []).join(', ') || st.user?.email || '')}"></label>
      <footer><button class="btn ghost" data-test>Enviar una prueba ahora</button><span style="flex:1"></span><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Guardar</button></footer></div>`, {
      onMount: root => {
        const read = () => ({ on: root.querySelector('#d-on').checked, weekday: Number(val(root, '#d-day')), to: val(root, '#d-to').split(/[,;\s]+/).filter(Boolean), cc: val(root, '#d-cc').split(/[,;\s]+/).filter(Boolean) });
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('[data-ok]').onclick = () => { st.data.settings.digest = read(); P.save(); P.closeLayer(); P.render(); P.toast(st.data.settings.digest.on ? 'Resumen semanal activado' : 'Resumen semanal desactivado'); };
        root.querySelector('[data-test]').onclick = async () => { const d = read(); try { await P.api('/api/reminders', { method: 'POST', body: { plan: st.id, to: d.to, cc: d.cc, sendNow: true, kind: 'manual', subject: `Resumen · Plan de implementación ${st.data.client.name}`, intro: 'Este es el resumen del plan: tareas pendientes de las últimas reuniones.' } }); P.toast('Prueba enviada ✓'); } catch (e) { alert(e.message); } };
      },
    });
  }

  // ---------- novedades manuales ----------
  function openUpdate(id) {
    const list = st.data.updates.manual; const u = id ? list.find(x => x.id === id) : { id: uid(), module: '', title: '', desc: '', status: 'Disponible' };
    const mods = st.data.rows.filter(r => r.type === 'module').map(r => r.name);
    P.openLayer(`<div class="modal" role="dialog" aria-label="Novedad">
      <header><h3>${id ? 'Editar' : 'Agregar'} novedad o respuesta</h3><button class="icon-btn" data-x>✕</button></header>
      <p class="muted" style="font-size:13px">Usalo para responder consultas puntuales del cliente sobre funcionalidades (como en el plan de Estafeta).</p>
      <label class="field"><span>Módulo</span><input class="input" id="u-mod" list="u-mods" value="${esc(u.module)}"><datalist id="u-mods">${mods.map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>
      <label class="field"><span>Funcionalidad</span><input class="input" id="u-title" value="${esc(u.title)}" placeholder="Ej.: Cancelación masiva de vacaciones"></label>
      <label class="field"><span>Descripción</span><textarea class="input" id="u-desc" rows="3">${esc(u.desc)}</textarea></label>
      <label class="field"><span>Estado</span><input class="input" id="u-status" list="u-sts" value="${esc(u.status)}"><datalist id="u-sts">${['Disponible', 'En desarrollo · Q4 2026', 'En roadmap · Q1 2027', 'Workaround vía API', 'API en desarrollo', 'No en roadmap'].map(s => `<option value="${s}">`).join('')}</datalist></label>
      <footer>${id ? '<button class="btn danger" data-del>Eliminar</button><span style="flex:1"></span>' : ''}<button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Guardar</button></footer></div>`, {
      onMount: root => {
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('[data-del]') && (root.querySelector('[data-del]').onclick = () => { st.data.updates.manual = list.filter(x => x.id !== id); P.save(); P.closeLayer(); P.render(); });
        root.querySelector('[data-ok]').onclick = () => {
          Object.assign(u, { module: val(root, '#u-mod'), title: val(root, '#u-title'), desc: val(root, '#u-desc'), status: val(root, '#u-status') });
          if (!u.title) return root.querySelector('#u-title').focus();
          if (!id) list.push(u); P.save(); P.closeLayer(); P.render();
        };
      },
    });
  }

  // ---------- configuración del plan ----------
  P.processLogo = file => new Promise((res, rej) => {
    if (!file) return rej(new Error('Sin archivo'));
    const fr = new FileReader();
    fr.onload = () => {
      if (file.type === 'image/svg+xml') return res({ dataUrl: fr.result, color: null });
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 480 / img.width, 160 / img.height);
        const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
        res({ dataUrl: c.toDataURL('image/png'), color: P.dominantColor(x, c.width, c.height) });
      };
      img.onerror = () => rej(new Error('No se pudo leer la imagen'));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
  // Color predominante "de marca": ignora transparentes, blancos, negros y grises.
  P.dominantColor = (ctx, w, h) => {
    const d = ctx.getImageData(0, 0, w, h).data; const buckets = new Map();
    for (let i = 0; i < d.length; i += 16) {
      const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (a < 200) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx < 40 || mn > 225 || (mx - mn) < 40) continue;
      const k = `${r >> 4},${g >> 4},${b >> 4}`;
      const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; buckets.set(k, e);
    }
    let best = null; buckets.forEach(e => { if (!best || e.n > best.n) best = e; });
    return best ? P.colorUtil.rgb2hex([best.r / best.n, best.g / best.n, best.b / best.n]) : null;
  };

  // ---------- compartir con el equipo ----------
  const who = e => (e || '').split('@')[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  async function openShare() {
    let info;
    try { info = await P.api(`/api/shares?plan=${encodeURIComponent(st.id)}`); } catch (e) { return alert(e.message); }
    const dom = st.config.domain || 'humand.co';
    const today = D.today();
    const rows = info.shares.map(sh => {
      const expired = sh.expires_at && sh.expires_at < new Date().toISOString();
      return `<div class="share-row"><div><b>${esc(who(sh.email))}</b> <span class="muted">${esc(sh.email)}</span><br>
        <small class="muted">${sh.role === 'view' ? 'Solo ver' : 'Puede editar'} · ${sh.expires_at ? (expired ? '<span style="color:var(--err-600,#c00)">venció</span> el ' : 'hasta el ') + new Date(sh.expires_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'sin vencimiento'}</small></div>
        <button class="btn sm ghost" data-unshare="${esc(sh.email)}">Quitar</button></div>`;
    }).join('');
    P.openLayer(`<div class="modal" role="dialog" aria-label="Compartir plan" style="width:min(560px,100%)">
      <header><h3>👥 Compartir con el equipo</h3><button class="icon-btn" data-x>✕</button></header>
      <p class="muted" style="font-size:13px">Tu compañero lo va a ver en su carpeta <b>“Compartidos conmigo”</b>, separado de sus proyectos. Ideal para cubrirte en vacaciones: poné una fecha y el acceso se quita solo.</p>
      <div class="grid3" style="grid-template-columns:2fr 1fr 1fr">
        <label class="field"><span>Mail</span><input class="input" id="s-email" placeholder="nombre@${esc(dom)}"></label>
        <label class="field"><span>Permiso</span><select class="input" id="s-role"><option value="edit">Puede editar</option><option value="view">Solo ver</option></select></label>
        <label class="field"><span>Hasta (opcional)</span><input type="date" class="input" id="s-until" min="${today}"></label>
      </div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-share>Compartir</button></div>
      <h4 style="margin-top:8px">Con acceso</h4>
      <div class="share-list">${rows || '<div class="muted" style="font-size:13px">Todavía no lo compartiste con nadie.</div>'}</div>
      <details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Transferir el plan a otra persona</summary>
        <p class="muted" style="font-size:12px;margin:6px 0">Para cuando el cliente pasa a otra persona del equipo. El plan se mueve a su carpeta “Mis proyectos” y vos lo seguís viendo en “Compartidos conmigo”.</p>
        <div class="row"><input class="input" id="t-email" placeholder="nombre@${esc(dom)}" style="flex:1"><button class="btn ghost" data-transfer>Transferir</button></div>
      </details>
      <footer><span style="flex:1"></span><button class="btn ghost" data-x>Cerrar</button></footer></div>`, {
      onMount: root => {
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('[data-share]').onclick = async () => {
          const email = val(root, '#s-email'); if (!email) return root.querySelector('#s-email').focus();
          try {
            await P.api('/api/shares', { method: 'POST', body: { plan: st.id, email, role: val(root, '#s-role'), until: val(root, '#s-until') || null } });
            P.toast(`Compartido con ${who(email)}${st.config.mail ? ' · le llegó un aviso por mail' : ''}`); openShare();
          } catch (e) { alert(e.message); }
        };
        root.querySelectorAll('[data-unshare]').forEach(b => b.onclick = async () => {
          if (!confirm(`¿Quitarle el acceso a ${b.dataset.unshare}?`)) return;
          try { await P.api(`/api/shares?plan=${encodeURIComponent(st.id)}&email=${encodeURIComponent(b.dataset.unshare)}`, { method: 'DELETE' }); openShare(); } catch (e) { alert(e.message); }
        });
        root.querySelector('[data-transfer]').onclick = async () => {
          const to = val(root, '#t-email'); if (!to) return root.querySelector('#t-email').focus();
          if (!confirm(`¿Transferir el plan de ${st.data.client.name} a ${to}? Pasa a ser su responsable y vos quedás con acceso para editar.`)) return;
          try { await P.api('/api/shares', { method: 'POST', body: { plan: st.id, transferTo: to } }); P.toast('Plan transferido'); setTimeout(() => location.reload(), 900); } catch (e) { alert(e.message); }
        };
      },
    });
  }

  // ---------- historial de cambios ----------
  async function openHistory() {
    let list = [];
    try { list = (await P.api(`/api/activity?plan=${encodeURIComponent(st.id)}`)).activity; } catch (e) { return alert(e.message); }
    const groups = new Map();
    list.forEach(a => { const d = new Date(a.created_at); let k = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }); k = k.charAt(0).toUpperCase() + k.slice(1); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); });
    const body = list.length ? [...groups].map(([day, items]) => `<h4>${esc(day)}</h4>${items.map(a => `<div class="hist"><span class="t">${new Date(a.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span><span><b>${esc(a.actor === st.user?.email ? 'Vos' : who(a.actor))}</b> · ${esc(a.summary)}</span></div>`).join('')}`).join('')
      : '<div class="muted" style="font-size:13px">Todavía no hay cambios registrados. A partir de ahora, cada cambio queda anotado con quién lo hizo.</div>';
    P.openLayer(`<div class="drawer" style="width:min(520px,100%)" role="dialog" aria-label="Historial">
      <header><h3>🕘 Historial de cambios</h3><button class="icon-btn" data-x>✕</button></header>
      <div>${body}</div></div>`, { center: false, onMount: root => root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer) });
  }

  function openConfig() {
    const d = st.data; const s = d.settings;
    const stageOf = k => d.rows.some(r => r.key === k && r.type === 'module') ? 'e1' : d.stage2.includes(k) ? 'e2' : 'off';
    const toggles = [['showProgress', 'Progreso real', 'Avance, % completado, semáforo y plan original vs. real'], ['showToday', 'Línea de "hoy" en el cronograma', ''], ['showHolidays', 'Feriados', ''], ['showIntegrations', 'Integraciones', ''], ['showAgenda', 'Agenda semanal', ''], ['showDedication', 'Dedicación esperada', ''], ['showMinutas', 'Minutas y tareas', ''], ['showUpdates', 'Novedades de producto (Notion)', '']];
    P.openLayer(`<div class="drawer" style="width:min(620px,100%)" role="dialog" aria-label="Configuración">
      <header><h3>Configuración del plan</h3><button class="icon-btn" data-x>✕</button></header>
      <h4>Cliente</h4>
      <div class="grid2"><label class="field"><span>Nombre de la empresa</span><input class="input" id="c-name" value="${esc(d.client.name)}"></label>
        <label class="field"><span>País (feriados)</span><select class="input" id="c-country">${COUNTRIES.map(([k, v]) => `<option value="${k}" ${d.holidays.country === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="row" style="align-items:flex-end">
        <label class="field" style="flex:1"><span>Logo (PNG, JPG o SVG) · si no cargás logo se muestra el nombre</span><input type="file" class="input" id="c-logo" accept="image/*"></label>
        ${d.client.logo ? `<img src="${esc(d.client.logo)}" style="max-height:40px;max-width:120px"><button class="btn sm danger" data-rmlogo>Quitar</button>` : ''}
      </div>
      <label class="field"><span>Color de marca (se toma del logo; podés cambiarlo)</span><div class="row"><input type="color" id="c-color" value="${esc(d.client.brandColor || '#496be3')}" style="width:48px;height:36px;border:0;background:none"><input class="input" id="c-colorhex" value="${esc(d.client.brandColor || '')}" placeholder="#496be3" style="width:120px"></div></label>
      <h4>Contactos del cliente (para recordatorios)</h4>
      <div id="c-contacts" style="display:flex;flex-direction:column;gap:6px">${(d.client.contacts || []).map((c, i) => `<div class="row" data-ci="${i}" style="gap:6px"><input class="input" data-ck="name" value="${esc(c.name)}" placeholder="Nombre" style="flex:1"><input class="input" data-ck="email" value="${esc(c.email)}" placeholder="mail" style="flex:1.3"><input class="input" data-ck="role" value="${esc(c.role || '')}" placeholder="Rol" style="flex:.8"><button class="icon-btn" data-rmc="${i}">✕</button></div>`).join('')}</div>
      <button class="btn ghost sm" data-addc style="align-self:flex-start">＋ Agregar contacto</button>
      <h4>Equipo Humand</h4>
      <div class="grid2"><label class="field"><span>Responsable de implementación</span><input class="input" id="c-hname" value="${esc(d.humand?.name || '')}"></label><label class="field"><span>Mail</span><input class="input" id="c-hmail" value="${esc(d.humand?.email || '')}"></label></div>
      <h4>Fechas</h4>
      <div class="grid3"><label class="field"><span>Inicio</span><input type="date" class="input" id="c-start" value="${d.dates.start || ''}"></label><label class="field"><span>Go-live</span><input type="date" class="input" id="c-golive" value="${d.dates.golive || ''}"></label><label class="field"><span>Emisión del documento</span><input type="date" class="input" id="c-issued" value="${d.dates.issued || ''}"></label></div>
      <h4>Módulos</h4>
      <p class="muted" style="font-size:12px">Etapa 1 = entra al cronograma · Etapa 2 = post-lanzamiento · — = no se implementa.</p>
      ${CATS.map(c => `<div><div style="font-size:12px;font-weight:600;color:var(--text-3);margin:6px 0">${esc(c)}</div>${MODULES.filter(m => m.cat === c).map(m => `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--n-100)"><span>${esc(m.name)}</span><select class="input" data-stage="${m.key}" style="width:auto;padding:4px 8px;font-size:12px">${[['e1', 'Etapa 1'], ['e2', 'Etapa 2'], ['off', '—']].map(([k, v]) => `<option value="${k}" ${stageOf(m.key) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`).join('')}</div>`).join('')}
      <h4>¿Qué ve el cliente? (link y exportables)</h4>
      ${toggles.map(([k, l, h]) => `<label class="switch"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}> <span>${l}${h ? `<br><small class="muted">${h}</small>` : ''}</span></label>`).join('')}
      <footer>${st.access === 'owner' ? '<button class="btn danger" data-archive>Archivar plan</button>' : ''}<span style="flex:1"></span><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Guardar</button></footer></div>`, {
      center: false, onMount: root => {
        const pending = { logo: d.client.logo, color: d.client.brandColor, contacts: structuredClone(d.client.contacts || []) };
        const readContacts = () => { root.querySelectorAll('[data-ci]').forEach(el => { const c = pending.contacts[el.dataset.ci]; el.querySelectorAll('[data-ck]').forEach(i => c[i.dataset.ck] = i.value.trim()); }); };
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('#c-logo').onchange = async e => {
          try { const r = await P.processLogo(e.target.files[0]); pending.logo = r.dataUrl; if (r.color) { pending.color = r.color; root.querySelector('#c-color').value = r.color; root.querySelector('#c-colorhex').value = r.color; } P.toast(r.color ? 'Logo cargado · tomamos el color de marca del logo' : 'Logo cargado'); }
          catch (err) { alert(err.message); }
        };
        root.querySelector('[data-rmlogo]') && (root.querySelector('[data-rmlogo]').onclick = () => { pending.logo = ''; P.toast('Se quitará el logo al guardar: se mostrará el nombre de la empresa'); });
        root.querySelector('#c-color').oninput = e => { pending.color = e.target.value; root.querySelector('#c-colorhex').value = e.target.value; };
        root.querySelector('#c-colorhex').oninput = e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { pending.color = e.target.value; root.querySelector('#c-color').value = e.target.value; } };
        root.querySelector('[data-addc]').onclick = () => { readContacts(); pending.contacts.push({ name: '', email: '', role: '' }); const box = root.querySelector('#c-contacts'); const i = pending.contacts.length - 1; box.insertAdjacentHTML('beforeend', `<div class="row" data-ci="${i}" style="gap:6px"><input class="input" data-ck="name" placeholder="Nombre" style="flex:1"><input class="input" data-ck="email" placeholder="mail" style="flex:1.3"><input class="input" data-ck="role" placeholder="Rol" style="flex:.8"></div>`); };
        root.querySelectorAll('[data-rmc]').forEach(b => b.onclick = () => { readContacts(); pending.contacts.splice(+b.dataset.rmc, 1); b.closest('[data-ci]').remove(); root.querySelectorAll('[data-ci]').forEach((el, i) => el.dataset.ci = i); });
        root.querySelector('[data-archive]') && (root.querySelector('[data-archive]').onclick = async () => { if (!confirm('¿Archivar este plan? El link del cliente dejará de funcionar.')) return; await P.api(`/api/plan?id=${encodeURIComponent(st.id)}`, { method: 'DELETE' }); location.href = '/'; });
        root.querySelector('[data-ok]').onclick = () => {
          readContacts();
          d.client.name = val(root, '#c-name') || d.client.name;
          d.client.logo = pending.logo; d.client.brandColor = pending.color;
          d.client.contacts = pending.contacts.filter(c => c.name || c.email);
          const country = val(root, '#c-country'); const countryChanged = country !== d.holidays.country;
          d.holidays.country = country; d.client.country = country;
          d.humand = { name: val(root, '#c-hname'), email: val(root, '#c-hmail') };
          d.dates.start = val(root, '#c-start') || d.dates.start; d.dates.issued = val(root, '#c-issued') || d.dates.issued;
          const gl = val(root, '#c-golive');
          if (gl && gl !== d.dates.golive) { d.dates.golive = gl; const g = d.rows.find(r => r.type === 'golive'); if (g) { g.start = gl; g.end = gl; } }
          root.querySelectorAll('[data-set]').forEach(c => s[c.dataset.set] = c.checked);
          // módulos
          let modsChanged = false;
          root.querySelectorAll('[data-stage]').forEach(sel => {
            const k = sel.dataset.stage; const want = sel.value; const now = stageOf(k);
            if (want === now) return; modsChanged = true;
            d.stage2 = d.stage2.filter(x => x !== k);
            if (now === 'e1' && want !== 'e1') d.rows = d.rows.filter(r => !(r.key === k && r.type === 'module'));
            if (want === 'e2') d.stage2.push(k);
            if (want === 'e1') {
              const m = MODULES.find(x => x.key === k); const start = D.add(D.monday(d.dates.start || P.today), 14); const end = D.add(start, m.weeks * 7 - 3);
              const qa = d.rows.findIndex(r => r.key === 'qa');
              d.rows.splice(qa >= 0 ? qa : d.rows.length, 0, { id: uid(), type: 'module', key: k, name: m.name, cat: m.cat, hc: m.hc, label: 'Configuración', start, end, baseStart: start, baseEnd: end, done: false, owner: '', notes: [] });
            }
          });
          P.save(); P.closeLayer(); P.computeDayW(); P.render();
          if (countryChanged) { d.holidays.list = []; P.fetchHolidays(); }
          if (modsChanged) P.loadUpdates();
        };
      },
    });
  }

  // ---------- exportables ----------
  const EXPORT_FLAGS = [['showProgress', 'Progreso real (avance, atrasos y plan original vs. real)'], ['showToday', 'Línea de "hoy"'], ['showHolidays', 'Feriados'], ['showIntegrations', 'Integraciones'], ['showAgenda', 'Agenda semanal'], ['showDedication', 'Dedicación esperada'], ['showMinutas', 'Minutas y tareas'], ['showUpdates', 'Novedades de producto']];
  function openExport() {
    const s = st.data.settings;
    P.openLayer(`<div class="modal" role="dialog" aria-label="Exportar">
      <header><h3>Exportar para el cliente</h3><button class="icon-btn" data-x>✕</button></header>
      <p class="muted" style="font-size:13px">Elegí qué incluir. Por defecto se usa lo mismo que ve el cliente en su link.</p>
      ${EXPORT_FLAGS.map(([k, l]) => `<label class="switch"><input type="checkbox" data-ex="${k}" ${s[k] ? 'checked' : ''}> ${l}</label>`).join('')}
      <footer><button class="btn ghost" data-x>Cancelar</button><button class="btn ghost" data-html>⬇ HTML</button><button class="btn" data-pdf>⬇ PDF</button></footer></div>`, {
      onMount: root => {
        const read = () => { const o = { showBaseline: true }; root.querySelectorAll('[data-ex]').forEach(c => o[c.dataset.ex] = c.checked); return o; };
        root.querySelectorAll('[data-x]').forEach(b => b.onclick = P.closeLayer);
        root.querySelector('[data-pdf]').onclick = () => { const o = read(); P.closeLayer(); doPrint(o); };
        root.querySelector('[data-html]').onclick = () => { const o = read(); P.closeLayer(); exportHtml(o); };
      },
    });
  }

  function doPrint(opts) {
    st.exportOpts = { showBaseline: true, ...opts }; st.printing = true;
    P.computeDayW(); P.render();
    const done = () => { st.exportOpts = null; st.printing = false; P.computeDayW(); P.render(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 150);
  }
  P.doPrint = doPrint;

  async function exportHtml(opts) {
    try {
      const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.text(); });
      const [css1, css2, j1, j2, j3, j4] = await Promise.all(['/assets/app.css', '/assets/plan.css', '/assets/catalog.js', '/assets/plan.js', '/assets/plan-views.js', '/assets/plan-edit.js'].map(get));
      const data = structuredClone(st.data);
      data.settings = { ...data.settings, ...opts, showBaseline: true };
      if (!opts.showMinutas) data.minutas = [];
      data.rows.forEach(r => { r.notes = (r.notes || []).filter(n => n.public !== false); });
      const hidden = new Set(data.updates.hidden);
      const updates = opts.showUpdates ? st.updates.filter(u => !hidden.has(u.id)) : [];
      const snap = { data, updates, generatedAt: P.today };
      const safe = s => s.replace(/<\/script/gi, '<\\/script');
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan de trabajo · ${esc(data.client.name)} + Humand</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;600&display=swap">
<style>${css1}\n${css2}</style></head><body>
<div id="app"></div><div class="toast" id="toast"></div>
<script>window.__SNAPSHOT__=${safe(JSON.stringify(snap))};</script>
<script>${safe(j1)}</script><script>${safe(j2)}</script><script>${safe(j3)}</script><script>${safe(j4)}</script>
</body></html>`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      a.download = `Plan de trabajo - ${data.client.name.replace(/[\\/:*?"<>|]/g, '')}.html`;
      document.body.appendChild(a); a.click(); a.remove();
      P.toast('HTML descargado (solo lectura, funciona sin conexión al sistema)');
    } catch (e) { alert('No se pudo generar el HTML: ' + e.message); }
  }
})();
