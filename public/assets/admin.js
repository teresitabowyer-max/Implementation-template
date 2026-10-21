/* Panel del equipo Humand: ingreso, listado de planes y creación de planes nuevos. */
(function () {
  const { MODULES, CATS, COUNTRIES, D, buildPlan } = window.CATALOG;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } } };

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const t = store.get('hu_token'); if (t) headers.Authorization = `Bearer ${t}`;
    const r = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.status = r.status; throw e; }
    return j;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000); }

  let me = null, cfg = {};

  // ---------- ingreso ----------
  function afterLogin(j) {
    store.set('hu_token', j.token); store.set('hu_name', j.user.name); store.set('hu_email', j.user.email);
    const back = store.get('hu_back'); store.set('hu_back', null);
    if (back && back.startsWith('/p/')) location.href = back; else { history.replaceState(null, '', '/'); boot(); }
  }
  function loginView(err, sentTo) {
    $('#who').innerHTML = '';
    const dom = cfg.domain || 'humand.co';
    const pw = cfg.login === 'password';
    if (sentTo) {
      $('#app').innerHTML = `<div class="login card" style="text-align:center">
        <div style="font-size:40px">📬</div><h2 style="font-size:20px;margin:8px 0">Revisá tu mail</h2>
        <p class="muted">Te mandamos un link para entrar a <b>${esc(sentTo)}</b>. Vence en 20 minutos.<br>Si no lo ves, fijate en spam o promociones.</p>
        <button class="btn ghost" id="again" style="margin-top:16px">Usar otro mail</button></div>`;
      $('#again').onclick = () => loginView();
      return;
    }
    $('#app').innerHTML = `<div class="login card">
      <h2 style="font-size:20px;margin-bottom:4px">Ingresá al generador de planes</h2>
      <p class="muted" style="margin-bottom:16px">Solo para el equipo de Humand: cada persona ve sus propios planes y los que le compartieron. ${pw ? '' : 'Te mandamos un link a tu mail para entrar, sin contraseña.'}</p>
      <form id="lf" style="display:flex;flex-direction:column;gap:12px">
        <label class="field"><span>Tu mail de Humand</span><input class="input" type="email" name="email" required placeholder="nombre@${esc(dom)}" value="${esc(store.get('hu_email') || '')}"></label>
        ${pw ? `<label class="field"><span>Contraseña del equipo</span><input class="input" type="password" name="password" required></label>` : ''}
        ${err ? `<div class="chip err" style="align-self:flex-start">${esc(err)}</div>` : ''}
        <button class="btn" style="justify-content:center">${pw ? 'Ingresar' : 'Enviarme el link'}</button>
      </form></div>`;
    $('#lf').onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try {
        const j = await api('/api/login', { method: 'POST', body: f });
        if (j.token) return afterLogin(j);
        store.set('hu_email', f.email);
        if (j.devLink) console.log('Link de acceso (modo local):', j.devLink);
        loginView(null, f.email);
      } catch (err) { loginView(err.message); }
    };
  }

  // ---------- listado: Mis proyectos / Compartidos conmigo / Todo el equipo ----------
  const who = e => (e || '').split('@')[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  async function listView() {
    $('#who').innerHTML = `${esc(me.name)}${me.leader ? ' <span class="chip">Líder</span>' : ''} <button class="btn sm ghost" id="logout">Salir</button>`;
    $('#logout').onclick = () => { store.set('hu_token', null); boot(); };
    const tab = location.hash === '#traspasos' ? 'traspasos' : (store.get('hu_folder') || 'mine');
    $('#app').innerHTML = `<h1>Planes de implementación</h1><p class="lead">Creá el plan, compartí el link con el cliente y actualizalo desde la misma página: vos ves los controles de edición, el cliente no.</p>
      <div class="row" style="margin-bottom:16px"><button class="btn" id="new">＋ Nuevo plan</button><a class="btn ghost" href="/hubspot" title="Instalá el botón para crear planes desde un deal de HubSpot">🟠 Desde HubSpot</a><input class="input" id="q" placeholder="Buscar cliente…" style="max-width:260px"><label class="row" style="gap:6px;font-size:13px"><input type="checkbox" id="onlyrl"> 🚩 Solo redlist</label></div>
      <nav class="folders" id="folders"></nav>
      <div id="list"><div class="muted">Cargando…</div></div>`;
    $('#new').onclick = () => wizard();
    let res;
    try { res = await api('/api/plans'); } catch (e) { if (e.status === 401) return loginView(); $('#list').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const folders = [['mine', '📁 Mis proyectos', res.mine], ['shared', '🤝 Compartidos conmigo', res.shared]];
    if (res.leader) folders.push(['team', '👥 Todo el equipo', res.team]);
    folders.push(['traspasos', '🏖 Traspasos', []]);
    let cur = folders.find(f => f[0] === tab) ? tab : 'mine';
    const until = d => d ? ` hasta el ${new Date(d).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` : '';
    const cardHtml = (p, kind) => `
        <div class="pcard"><div class="stripe" style="background:${esc(p.summary.brandColor || '#496be3')}"></div>
          <h3>${esc(p.client_name)}${p.summary.redlist ? ` <span class="rl-chip" title="${esc(p.summary.redlistReason || 'En redlist')}">🚩 Redlist</span>` : ''}</h3>
          ${p.summary.stage || Number(p.summary.pilot) > 0 ? `<div class="meta">${p.summary.stage ? `Deal: ${esc(p.summary.stage)}` : ''}${Number(p.summary.pilot) > 0 ? ` · Piloto ${esc(p.summary.pilot)} m` : ''}</div>` : ''}
          ${kind === 'shared' ? `<div class="sharetag">Compartido por ${esc(who(p.owner_email))} · ${p.share.role === 'view' ? 'solo ver' : 'puede editar'}${until(p.share.expires_at)}</div>` : ''}
          <div class="meta">${p.summary.golive ? `Go-live: ${D.long(p.summary.golive)}` : 'Sin fecha de go-live'}${kind !== 'mine' && p.summary.owner ? ` · ${esc(p.summary.owner)}` : ''}</div>
          <div class="prog"><span style="width:${p.summary.progress}%"></span></div>
          <div class="meta">${p.summary.progress}% completado · actualizado ${new Date(p.updated_at).toLocaleDateString('es-AR')}</div>
          <div class="acts"><a class="btn sm" href="/p/${encodeURIComponent(p.id)}">Abrir</a><button class="btn sm ghost" data-copy="${esc(p.id)}">🔗 Link cliente</button>${kind === 'mine' ? `<button class="btn sm quiet" data-dup="${esc(p.id)}" data-name="${esc(p.client_name)}">Duplicar</button>` : ''}</div>
        </div>`;
    const draw = () => {
      $('#folders').innerHTML = folders.map(([k, l, arr]) => `<button class="${k === cur ? 'on' : ''}" data-folder="${k}">${l}${k === 'traspasos' ? '' : ` <span class="n">${arr.length}</span>`}</button>`).join('');
      document.querySelectorAll('[data-folder]').forEach(b => b.onclick = () => { cur = b.dataset.folder; store.set('hu_folder', cur); history.replaceState(null, '', cur === 'traspasos' ? '#traspasos' : location.pathname); draw(); });
      if (cur === 'traspasos') return handoffView(res);
      const q = ($('#q').value || '').toLowerCase();
      const arr = folders.find(f => f[0] === cur)[2];
      const onlyRl = $('#onlyrl')?.checked;
      const list = arr.filter(p => (p.client_name.toLowerCase().includes(q) || (p.owner_email || '').includes(q)) && (!onlyRl || p.summary.redlist));
      const empty = { mine: 'Todavía no tenés planes. Creá el primero con “Nuevo plan”.', shared: 'Nadie te compartió planes por ahora. Cuando un compañero te comparta uno, aparece acá, separado de los tuyos.', team: 'No hay planes de otras personas.' }[cur];
      let html;
      if (!list.length) html = `<div class="empty">${arr.length ? 'No hay planes que coincidan.' : empty}</div>`;
      else if (cur === 'team') {
        const by = new Map(); list.forEach(p => { const k = p.owner_email || 'sin responsable'; if (!by.has(k)) by.set(k, []); by.get(k).push(p); });
        html = [...by].sort((a, b) => a[0].localeCompare(b[0])).map(([o, ps]) => `<h3 class="owner-h">${esc(who(o) || o)} <span class="muted">· ${ps.length} ${ps.length === 1 ? 'plan' : 'planes'}</span></h3><div class="plans">${ps.map(p => cardHtml(p, 'team')).join('')}</div>`).join('');
      } else html = `<div class="plans">${list.map(p => cardHtml(p, cur)).join('')}</div>`;
      $('#list').innerHTML = html;
      document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const u = `${location.origin}/p/${b.dataset.copy}`; navigator.clipboard?.writeText(u).then(() => toast('Link copiado'), () => prompt('Link del cliente', u)); });
      document.querySelectorAll('[data-dup]').forEach(b => b.onclick = async () => {
        const name = prompt('Nombre del cliente para la copia:', b.dataset.name + ' (copia)'); if (!name) return;
        const j = await api('/api/plans', { method: 'POST', body: { duplicateOf: b.dataset.dup, name } }); location.href = `/p/${j.plan.id}`;
      });
    };
    $('#q').oninput = draw; $('#onlyrl').onchange = draw; draw();
  }

  // ---------- traspasos por vacaciones: tabla del equipo (reemplaza la planilla) ----------
  const fdate = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
  const COLS = [['client', 'Cliente'], ['priority', 'Prioridad'], ['users', 'Q Users'], ['info', 'Info general'], ['status', 'Estado del proyecto'], ['champion', 'Champion/Owner'], ['format', 'Formato sugerido'], ['responsibleName', 'Responsable a cargo'], ['cards', 'Cards asociadas'], ['integrations', 'Integraciones'], ['returnNotes', 'Comentarios para la vuelta'], ['links', 'Links útiles']];
  async function handoffView(res) {
    $('#list').innerHTML = '<div class="muted">Cargando traspasos…</div>';
    let H;
    try { H = await api('/api/handoff'); } catch (e) { $('#list').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const stateTxt = { active: 'en curso', upcoming: 'próximo', ended: 'terminado' };
    const cell = (r, k) => {
      if (k === 'client') return `<a href="/p/${encodeURIComponent(r.planId)}"><b>${esc(r.client)}</b></a>${r.redlist ? ' <span class="rl-chip">🚩</span>' : ''}`;
      if (k === 'priority') return r.priority ? `<span class="chip ${r.priority === 'Alta' ? 'err' : r.priority === 'Media' ? 'warn' : ''}">${esc(r.priority)}</span>` : '';
      if (k === 'responsibleName') return `${esc(r.responsibleName)}${r.mine ? ' <span class="chip accent">vos</span>' : ''}`;
      if (k === 'links') return r.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('<br>');
      return `<div class="clip">${esc(r[k] || '')}</div>`;
    };
    const groups = H.groups.map(g => `<section class="ho-group ${g.state}">
        <h3>🏖 Vacaciones · ${esc(g.ownerName)} <span class="muted">· ${g.from ? `${fdate(g.from)} al ` : 'hasta el '}${fdate(g.until)} · ${stateTxt[g.state]}</span></h3>
        <div class="ho-access">🔑 Ingreso a las comunidades → Usuario: <b>${esc(g.access.user)}</b> · Contraseña: ${g.access.hasPass ? (g.access.canSee ? `<button class="btn sm ghost" data-pass="${esc(g.owner)}">Ver</button>` : '<span class="muted">guardada (la ve quien cubre)</span>') : '<span class="muted">no cargada</span>'}${g.access.cmb ? ` · <a href="${esc(g.access.cmb)}" target="_blank" rel="noopener">CMB</a>` : ''}</div>
        <div class="ho-scroll"><table class="ho-table"><thead><tr>${COLS.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
        <tbody>${g.rows.map(r => `<tr>${COLS.map(c => `<td class="c-${c[0]}">${cell(r, c[0])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');
    $('#list').innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn" id="ho-new">🏖 Armar mi traspaso</button><button class="btn ghost" id="ho-csv" ${H.groups.length ? '' : 'disabled'}>⬇ Exportar</button><span class="muted" style="font-size:12px">La tabla se arma sola cuando alguien comparte un plan como traspaso por vacaciones. La ve todo el equipo.</span></div>
      <div id="ho-form"></div>${groups || '<div class="empty">No hay traspasos en curso. Cuando alguien se vaya de vacaciones y comparta sus planes como traspaso, aparecen acá.</div>'}`;
    $('#ho-new').onclick = () => handoffForm(res, H);
    $('#ho-csv').onclick = () => exportHandoffs(H);
    document.querySelectorAll('[data-pass]').forEach(b => b.onclick = async () => {
      try { const j = await api(`/api/handoff?creds=${encodeURIComponent(b.dataset.pass)}`); b.outerHTML = `<code class="pass">${esc(j.pass)}</code>`; } catch (e) { alert(e.message); }
    });
  }

  function exportHandoffs(H) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Vacaciones de', 'Desde', 'Hasta', ...COLS.map(c => c[1])].map(q).join(';')];
    H.groups.forEach(g => g.rows.forEach(r => lines.push([g.ownerName, g.from ? fdate(g.from) : '', fdate(g.until), ...COLS.map(([k]) => k === 'links' ? r.links.map(l => `${l.label}: ${l.url}`).join(' | ') : r[k])].map(q).join(';'))));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `traspasos-${D.today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Armar el traspaso de todos mis planes de una vez (cada plan se comparte con quien lo cubre).
  async function handoffForm(res, H) {
    let cfg = { settings: {}, people: [] };
    try { cfg = await api('/api/handoff?settings=1'); } catch {}
    const S = cfg.settings; const today = D.today();
    const prev = new Map(); (H.groups.find(g => g.owner === me.email)?.rows || []).forEach(r => prev.set(r.planId, r));
    const myG = H.groups.find(g => g.owner === me.email);
    $('#ho-form').innerHTML = `<div class="ho-form">
      <h3>🏖 Mi traspaso por vacaciones</h3>
      <div class="grid3" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <label class="field"><span>Me voy el</span><input type="date" class="input" id="hf-from" value="${esc(myG?.from || today)}"></label>
        <label class="field"><span>Vuelvo el (el acceso se corta ese día)</span><input type="date" class="input" id="hf-until" min="${today}" value="${esc(myG?.until || '')}"></label>
        <span></span>
      </div>
      <div class="creds"><b>🔑 Credenciales de ingreso a las comunidades</b> <span class="muted" style="font-size:12px">· se guardan cifradas; solo las ve quien te cubre</span>
        <div class="grid3" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <label class="field"><span>Usuario</span><input class="input" id="hf-cuser" value="${esc(S.user || me.email)}" autocomplete="off"></label>
          <label class="field"><span>Contraseña${S.hasPass ? ' (guardada)' : ''}</span><input type="password" class="input" id="hf-cpass" placeholder="${S.hasPass ? '•••••••• (vacío = usar la guardada)' : 'Cargala la primera vez'}" autocomplete="new-password"></label>
          <label class="field"><span>Link a tu CMB (opcional)</span><input class="input" id="hf-cmb" value="${esc(S.cmb || '')}"></label>
        </div>
        <label class="switch hs-confirm"><input type="checkbox" id="hf-cok"> <span>Confirmo que las credenciales están OK</span></label>
      </div>
      <p class="muted" style="font-size:12px;margin:8px 0">Tildá los planes que dejás a cargo de alguien. Q Users, estado, champion, integraciones, formato de reunión y links se completan solos con los datos de cada plan.</p>
      <datalist id="hf-people">${(cfg.people || []).map(e => `<option value="${esc(e)}">`).join('')}</datalist>
      <div class="ho-scroll"><table class="ho-table"><thead><tr><th></th><th>Cliente</th><th>Responsable a cargo</th><th>Prioridad</th><th>Info general</th><th>Cards asociadas</th></tr></thead><tbody>
      ${res.mine.map(p => { const r = prev.get(p.id) || {}; return `<tr data-plan="${esc(p.id)}">
        <td><input type="checkbox" class="hf-on" ${prev.has(p.id) ? 'checked' : ''}></td><td><b>${esc(p.client_name)}</b>${p.summary.redlist ? ' 🚩' : ''}</td>
        <td><input class="input hf-resp" list="hf-people" placeholder="nombre@humand.co" value="${esc(r.responsible || '')}"></td>
        <td><select class="input hf-prio">${['Alta', 'Media', 'Baja'].map(x => `<option ${(r.priority || 'Media') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><textarea class="input hf-info" rows="2" placeholder="Contexto y pendientes">${esc(r.info || '')}</textarea></td>
        <td><textarea class="input hf-cards" rows="2">${esc(r.cards || '')}</textarea></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" id="hf-cancel">Cancelar</button><button class="btn" id="hf-save">Compartir y armar la tabla</button></div></div>`;
    $('#hf-cancel').onclick = () => { $('#ho-form').innerHTML = ''; };
    document.querySelectorAll('#ho-form .hf-resp').forEach(i => i.oninput = () => { if (i.value) i.closest('tr').querySelector('.hf-on').checked = true; });
    $('#hf-save').onclick = async () => {
      const until = $('#hf-until').value, from = $('#hf-from').value;
      if (!until) return alert('Poné la fecha de vuelta.');
      if (!S.hasPass && !$('#hf-cpass').value) return alert('Cargá la contraseña la primera vez (después queda guardada).');
      if (!$('#hf-cok').checked) return alert('Confirmá que las credenciales están OK.');
      const rows = [...document.querySelectorAll('#ho-form tr[data-plan]')].filter(tr => tr.querySelector('.hf-on').checked);
      if (!rows.length) return alert('Tildá al menos un plan.');
      const miss = rows.find(tr => !tr.querySelector('.hf-resp').value.trim()); if (miss) { alert('Falta el responsable en algún plan tildado.'); return miss.querySelector('.hf-resp').focus(); }
      const btn = $('#hf-save'); btn.disabled = true; btn.textContent = 'Compartiendo…';
      const creds = { ok: true, user: $('#hf-cuser').value.trim(), pass: $('#hf-cpass').value || undefined, cmb: $('#hf-cmb').value.trim() };
      let ok = 0; const errs = [];
      for (const tr of rows) {
        try {
          await api('/api/shares', { method: 'POST', body: { plan: tr.dataset.plan, email: tr.querySelector('.hf-resp').value.trim(), role: 'edit', handoff: true, from, until,
            priority: tr.querySelector('.hf-prio').value, info: tr.querySelector('.hf-info').value, cards: tr.querySelector('.hf-cards').value, creds } });
          creds.pass = undefined; ok++;
        } catch (e) { errs.push(`${tr.querySelector('b').textContent}: ${e.message}`); }
      }
      toast(`Traspaso armado: ${ok} ${ok === 1 ? 'plan compartido' : 'planes compartidos'}`);
      if (errs.length) alert('No se pudieron compartir:\n' + errs.join('\n'));
      handoffView(res);
    };
  }

  // ---------- logo → color de marca ----------
  function processLogo(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        if (file.type === 'image/svg+xml') return res({ dataUrl: fr.result, color: null });
        const img = new Image();
        img.onload = () => {
          const sc = Math.min(1, 480 / img.width, 160 / img.height);
          const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
          const d = x.getImageData(0, 0, c.width, c.height).data; const b = new Map();
          for (let i = 0; i < d.length; i += 16) { const [r, g, bl, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a < 200) continue; const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx < 40 || mn > 225 || mx - mn < 40) continue; const k = `${r >> 4},${g >> 4},${bl >> 4}`; const e = b.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += bl; b.set(k, e); }
          let best = null; b.forEach(e => { if (!best || e.n > best.n) best = e; });
          const hex = best ? '#' + [best.r, best.g, best.b].map(v => Math.round(v / best.n).toString(16).padStart(2, '0')).join('') : null;
          res({ dataUrl: c.toDataURL('image/png'), color: hex });
        };
        img.onerror = () => rej(new Error('No se pudo leer la imagen'));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ---------- nuevo plan ----------
  // ---------- importación desde HubSpot (botón de favoritos) ----------
  const HS_KEYWORDS = {
    desempeno: /desempe|performance|evaluaci[oó]n de (desempe|competencia)|successfactors/i, objetivos: /objetivo|okr|\bgoals?\b/i,
    vacaciones: /vacaci|licencia|ausencia|time ?off/i, documentos: /legajo|recibo|documentos? personal/i, onboarding: /onboarding|inducci/i,
    asistencia: /asistencia|fichaje|ficha(r|da)|control horario|time ?tracking|turnos/i, reconocimientos: /reconocim|kudos/i, px: /clima|engagement|people experience/i,
    encuestas: /encuesta/i, muro: /\bmuro\b|comunicaci[oó]n interna|\bfeed\b/i, chats: /\bchats?\b/i, organigrama: /organigrama/i,
    capacitacion: /capacitaci|learning|cursos?\b|formaci[oó]n/i, reclutamiento: /reclutam|\bats\b|selecci[oó]n de personal|b[uú]squedas/i,
    servicios: /mesa de ayuda|service management|tickets?\b|gesti[oó]n de servicios/i, formularios: /formulario/i, eventos: /\beventos?\b/i,
    librerias: /librer[ií]a|base de conocimiento|knowledge/i, noticias: /noticias|newsletter/i,
  };
  const dmyToIso = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const countryCode = name => { const n = norm(name); const hit = COUNTRIES.find(([k, v]) => norm(v) === n || k.toLowerCase() === n); return hit ? hit[0] : ''; };
  function readHubspotHash() {
    const m = /#hs=([\w-]+)/.exec(location.hash); if (!m) return null;
    try { const b = m[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4))))); } catch { return null; }
  }

  function wizard(hs) {
    const today = D.today();
    const w = { step: 1, name: '', logo: '', color: '', country: 'AR', start: D.add(D.monday(today), 7), golive: D.add(D.monday(today), 7 + 70), stages: {}, integrations: [], contacts: [] };
    MODULES.forEach(m => w.stages[m.key] = 'off');
    if (hs) {
      w.hs = hs; w.name = hs.name || ''; w.countryDetected = hs.country || '';
      w.country = countryCode(hs.country) || 'AR'; w.countryOk = false;
      if (Array.isArray(hs.contacts) && hs.contacts.length) { w.contacts = hs.contacts.map(c => ({ name: c.name || '', email: c.email || '', role: c.role || '' })); w.contactsFromHs = true; w.contactsOk = false; }
      const st0 = dmyToIso(hs.implDate), gl0 = dmyToIso(hs.launch);
      if (st0) w.start = st0; if (gl0 && gl0 > w.start) w.golive = gl0;
      w.suggested = Object.keys(HS_KEYWORDS).filter(k => MODULES.some(m => m.key === k) && HS_KEYWORDS[k].test(hs.kickoff || ''));
      w.suggested.forEach(k => { w.stages[k] = 'e1'; });
      if (hs.integrations) w.integrations.push({ name: hs.integrations, desc: hs.intModules || '' });
    }
    const hsBox = () => {
      const h = w.hs; if (!h) return '';
      const pilot = Number(h.pilot) > 0 ? `Sí · ${h.pilot} ${Number(h.pilot) === 1 ? 'mes' : 'meses'}` : 'No';
      const items = [['Etapa del deal', h.stage], ['CX Stage', h.cxStage], ['Piloto', pilot], ['Account Executive', h.ae], ['Onboarding Leader', h.leader], ['Usuarios', h.users], ['Add-ons', h.addons], ['Herramientas de RR. HH.', h.hrTools], ['Contactos', (h.contacts || []).length ? `${h.contacts.length} (los confirmás en el paso 3)` : '']].filter(x => x[1]);
      return `<div class="hs-box"><div class="row" style="justify-content:space-between"><b>🟠 Datos importados de HubSpot</b><a href="${esc(h.url)}" target="_blank" rel="noopener" style="font-size:12px">Ver deal →</a></div>
        <div class="hs-grid">${items.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
        ${h.kickoff ? `<details><summary>Información del kick-off (cargada por el AE)</summary><div class="hs-kick">${esc(h.kickoff)}</div></details>` : '<div class="muted" style="font-size:12px">El deal no tiene información del kick-off cargada.</div>'}</div>`;
    };
    const draw = () => {
      $('#app').innerHTML = `<div style="max-width:760px;margin:32px auto"><div class="card" style="display:flex;flex-direction:column;gap:16px">
        <div class="steps"><span class="on"></span><span class="${w.step >= 2 ? 'on' : ''}"></span><span class="${w.step >= 3 ? 'on' : ''}"></span></div>
        ${w.step === 1 ? step1() : w.step === 2 ? step2() : step3()}
        <div class="row" style="justify-content:space-between"><button class="btn ghost" id="back">${w.step === 1 ? 'Cancelar' : '← Atrás'}</button><button class="btn" id="next">${w.step === 3 ? 'Crear plan' : 'Siguiente →'}</button></div>
      </div></div>`;
      bind();
    };
    const step1 = () => `<h2 style="font-size:20px">Datos del cliente</h2>${hsBox()}
      <label class="field"><span>Nombre de la empresa</span><input class="input" id="w-name" value="${esc(w.name)}" placeholder="Ej.: Estafeta"></label>
      <label class="field"><span>Logo (opcional) · si no lo cargás se muestra el nombre</span><input type="file" class="input" id="w-logo" accept="image/*"></label>
      <div class="logo-prev">${w.logo ? `<img src="${w.logo}" alt="">` : `<b style="font-size:20px;color:${esc(w.color || '#496be3')}">${esc(w.name || 'Nombre de la empresa')}</b>`}
        <span style="flex:1"></span><label class="row" style="gap:6px;font-size:12px">Color de marca <input type="color" id="w-color" value="${esc(w.color || '#496be3')}" style="width:40px;height:30px;border:0;background:none"></label></div>
      <div class="grid3">
        <label class="field"><span>País (feriados)</span><select class="input" id="w-country">${COUNTRIES.map(([k, v]) => `<option value="${k}" ${w.country === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Inicio de implementación</span><input type="date" class="input" id="w-start" value="${w.start}"></label>
        <label class="field"><span>Go-live previsto</span><input type="date" class="input" id="w-golive" value="${w.golive}"></label>
      </div>${w.hs ? `<label class="switch hs-confirm ${w.countryOk ? 'ok' : ''}"><input type="checkbox" id="w-country-ok" ${w.countryOk ? 'checked' : ''}> <span>Confirmo el país${w.countryDetected ? ` (HubSpot dice: <b>${esc(w.countryDetected)}</b>${countryCode(w.countryDetected) ? '' : ' — no está en la lista, elegilo arriba'})` : ' (HubSpot no lo informa, elegilo arriba)'}</span></label>` : ''}`;
    const step2 = () => `<h2 style="font-size:20px">Módulos</h2>
      <p class="muted" style="font-size:13px">Etapa 1 entra al cronograma (escalonado automáticamente) · Etapa 2 queda como post-lanzamiento. Después podés reordenar y mover todo desde el Gantt.</p>
      <div class="row"><button class="btn sm ghost" id="all1">Todos a Etapa 1</button><button class="btn sm ghost" id="none">Ninguno</button></div>
      <div class="modgrid">${CATS.map(c => `<div class="cat">${esc(c)}</div>${MODULES.filter(m => m.cat === c).map(m => `<div class="mod"><span>${esc(m.name)}${(w.suggested || []).includes(m.key) ? ' <span class="sug" title="Mencionado en el kick-off de HubSpot">kick-off</span>' : ''}</span><span class="seg">${[['e1', 'Etapa 1'], ['e2', 'Etapa 2'], ['off', '—']].map(([k, l]) => `<button class="${k} ${w.stages[m.key] === k ? 'on' : ''}" data-k="${m.key}" data-v="${k}">${l}</button>`).join('')}</span></div>`).join('')}`).join('')}</div>`;
    const step3 = () => `<h2 style="font-size:20px">Integraciones y contactos</h2>
      <p class="muted" style="font-size:13px">¿El cliente integra algún sistema (SAP, Workday, nómina, SSO…)? Corre en paralelo a los módulos.</p>
      <div id="ints" style="display:flex;flex-direction:column;gap:6px">${w.integrations.map((it, i) => `<div class="row" style="gap:6px"><input class="input" data-i="${i}" data-f="name" value="${esc(it.name)}" placeholder="Sistema (ej.: SAP)" style="flex:1"><input class="input" data-i="${i}" data-f="desc" value="${esc(it.desc)}" placeholder="Qué se integra (ej.: altas, bajas y estructura)" style="flex:2"><button class="icon-btn" data-rmi="${i}">✕</button></div>`).join('')}</div>
      <button class="btn sm ghost" id="addi" style="align-self:flex-start">＋ Agregar integración</button>
      <h3 style="font-size:16px;margin-top:8px">Contactos del cliente <span class="muted" style="font-weight:400;font-size:13px">(para recordatorios por mail · opcional)</span></h3>
      <div id="cts" style="display:flex;flex-direction:column;gap:6px">${w.contacts.map((c, i) => `<div class="row" style="gap:6px"><input class="input" data-c="${i}" data-f="name" value="${esc(c.name)}" placeholder="Nombre" style="flex:1"><input class="input" data-c="${i}" data-f="email" value="${esc(c.email)}" placeholder="mail" style="flex:1.4"><input class="input" data-c="${i}" data-f="role" value="${esc(c.role)}" placeholder="Rol" style="flex:.8"><button class="icon-btn" data-rmc="${i}">✕</button></div>`).join('')}</div>
      <button class="btn sm ghost" id="addc" style="align-self:flex-start">＋ Agregar contacto</button>
      ${w.contactsFromHs ? `<label class="switch hs-confirm ${w.contactsOk ? 'ok' : ''}"><input type="checkbox" id="w-contacts-ok" ${w.contactsOk ? 'checked' : ''}> <span>Verifiqué los contactos que vienen de HubSpot (nombre, mail y rol)</span></label>` : ''}`;
    const read = () => {
      if (w.step === 1) { if ($('#w-country-ok')) w.countryOk = $('#w-country-ok').checked; w.name = $('#w-name').value.trim(); w.country = $('#w-country').value; w.start = $('#w-start').value; w.golive = $('#w-golive').value; w.color = $('#w-color').value; }
      if (w.step === 3) {
        document.querySelectorAll('[data-i]').forEach(i => w.integrations[i.dataset.i][i.dataset.f] = i.value.trim());
        document.querySelectorAll('[data-c]').forEach(i => w.contacts[i.dataset.c][i.dataset.f] = i.value.trim());
        if ($('#w-contacts-ok')) w.contactsOk = $('#w-contacts-ok').checked;
      }
    };
    const bind = () => {
      $('#back').onclick = () => { read(); if (w.step === 1) return listView(); w.step--; draw(); };
      $('#next').onclick = async () => {
        read();
        if (w.step === 1) { if (!w.name) return $('#w-name').focus(); if (w.hs && !w.countryOk) { alert('Confirmá el país del cliente antes de seguir (define los feriados del cronograma).'); return $('#w-country-ok').focus(); } if (!w.start || !w.golive || w.golive <= w.start) return alert('Revisá las fechas: el go-live tiene que ser posterior al inicio.'); }
        if (w.step === 2 && !Object.values(w.stages).includes('e1')) return alert('Elegí al menos un módulo para la Etapa 1.');
        if (w.step < 3) { w.step++; return draw(); }
        if (w.contactsFromHs && !w.contactsOk) { alert('Verificá los contactos que vinieron de HubSpot antes de crear el plan.'); return $('#w-contacts-ok').focus(); }
        const data = buildPlan({
          client: { name: w.name, logo: w.logo, brandColor: w.color, contacts: w.contacts.filter(c => c.name || c.email) },
          humand: { name: me.name, email: me.email }, start: w.start, golive: w.golive, country: w.country,
          moduleKeys: MODULES.filter(m => w.stages[m.key] === 'e1').map(m => m.key),
          stage2Keys: MODULES.filter(m => w.stages[m.key] === 'e2').map(m => m.key),
          integrations: w.integrations.filter(i => i.name),
        });
        if (w.hs) { const { contacts, ...hsRest } = w.hs; data.hubspot = { ...hsRest, countryConfirmed: w.country, contactsConfirmed: !!w.contactsOk, importedAt: new Date().toISOString(), importedBy: me.email }; }
        $('#next').disabled = true;
        try { const j = await api('/api/plans', { method: 'POST', body: { data } }); location.href = `/p/${j.plan.id}`; }
        catch (e) { $('#next').disabled = false; alert(e.message); }
      };
      if (w.step === 1) {
        $('#w-logo').onchange = async e => { read(); try { const r = await processLogo(e.target.files[0]); w.logo = r.dataUrl; if (r.color) w.color = r.color; draw(); } catch (err) { alert(err.message); } };
        $('#w-name').oninput = () => { if (!w.logo) { w.name = $('#w-name').value; $('.logo-prev b').textContent = w.name || 'Nombre de la empresa'; } };
        $('#w-color').oninput = e => { w.color = e.target.value; const b = $('.logo-prev b'); if (b) b.style.color = w.color; };
      }
      if (w.step === 2) {
        document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { w.stages[b.dataset.k] = b.dataset.v; draw(); });
        $('#all1').onclick = () => { MODULES.forEach(m => w.stages[m.key] = 'e1'); draw(); };
        $('#none').onclick = () => { MODULES.forEach(m => w.stages[m.key] = 'off'); draw(); };
      }
      if (w.step === 3) {
        $('#addi').onclick = () => { read(); w.integrations.push({ name: '', desc: '' }); draw(); };
        $('#addc').onclick = () => { read(); w.contacts.push({ name: '', email: '', role: '' }); draw(); };
        document.querySelectorAll('[data-rmi]').forEach(b => b.onclick = () => { read(); w.integrations.splice(+b.dataset.rmi, 1); draw(); });
        document.querySelectorAll('[data-rmc]').forEach(b => b.onclick = () => { read(); w.contacts.splice(+b.dataset.rmc, 1); draw(); });
      }
    };
    draw();
  }

  async function boot() {
    const qs = new URLSearchParams(location.search);
    const hs = readHubspotHash();
    if (hs) { store.set('hu_hs', JSON.stringify(hs)); history.replaceState(null, '', location.pathname + location.search); }
    const back = qs.get('volver'); if (back) store.set('hu_back', back);
    try { const j = await api('/api/me'); me = j.user; cfg = j.config || {}; } catch { me = null; }
    const magic = qs.get('acceso');
    if (magic) {
      history.replaceState(null, '', '/');
      try { return afterLogin(await api('/api/login', { method: 'POST', body: { magic } })); } catch (e) { return loginView(e.message); }
    }
    if (!me) return loginView();
    let pending = null; try { pending = JSON.parse(store.get('hu_hs') || 'null'); } catch { } store.set('hu_hs', null);
    if (pending) return wizard(pending);
    listView();
  }
  boot();
})();
