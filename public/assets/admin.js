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

  let me = null;

  // ---------- ingreso ----------
  function loginView(err) {
    $('#who').innerHTML = '';
    $('#app').innerHTML = `<div class="login card">
      <h2 style="font-size:20px;margin-bottom:4px">Ingresá al generador de planes</h2>
      <p class="muted" style="margin-bottom:16px">Solo para el equipo de Humand. Los clientes ven su plan con el link que les compartas, sin poder editarlo.</p>
      <form id="lf" style="display:flex;flex-direction:column;gap:12px">
        <label class="field"><span>Tu nombre</span><input class="input" name="name" required value="${esc(store.get('hu_name') || '')}"></label>
        <label class="field"><span>Tu mail</span><input class="input" type="email" name="email" required value="${esc(store.get('hu_email') || '')}"></label>
        <label class="field"><span>Contraseña del equipo</span><input class="input" type="password" name="password" required></label>
        ${err ? `<div class="chip err" style="align-self:flex-start">${esc(err)}</div>` : ''}
        <button class="btn" style="justify-content:center">Ingresar</button>
      </form></div>`;
    $('#lf').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try {
        const j = await api('/api/login', { method: 'POST', body: Object.fromEntries(f) });
        store.set('hu_token', j.token); store.set('hu_name', j.user.name); store.set('hu_email', j.user.email);
        const back = new URLSearchParams(location.search).get('volver');
        if (back && back.startsWith('/p/')) location.href = back; else boot();
      } catch (err) { loginView(err.message); }
    };
  }

  // ---------- listado ----------
  async function listView() {
    $('#who').innerHTML = `${esc(me.name)} <button class="btn sm ghost" id="logout">Salir</button>`;
    $('#logout').onclick = () => { store.set('hu_token', null); boot(); };
    $('#app').innerHTML = `<h1>Planes de implementación</h1><p class="lead">Creá el plan, compartí el link con el cliente y actualizalo desde la misma página: vos ves los controles de edición, el cliente no.</p>
      <div class="row" style="margin-bottom:16px"><button class="btn" id="new">＋ Nuevo plan</button><input class="input" id="q" placeholder="Buscar cliente…" style="max-width:260px"></div>
      <div id="list"><div class="muted">Cargando…</div></div>`;
    $('#new').onclick = () => wizard();
    let plans = [];
    try { plans = (await api('/api/plans')).plans; } catch (e) { if (e.status === 401) return loginView(); $('#list').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const draw = () => {
      const q = ($('#q').value || '').toLowerCase();
      const list = plans.filter(p => p.client_name.toLowerCase().includes(q));
      $('#list').innerHTML = list.length ? `<div class="plans">${list.map(p => `
        <div class="pcard"><div class="stripe" style="background:${esc(p.summary.brandColor || '#496be3')}"></div>
          <h3>${esc(p.client_name)}</h3>
          <div class="meta">${p.summary.golive ? `Go-live: ${D.long(p.summary.golive)}` : 'Sin fecha de go-live'}${p.summary.owner ? ` · ${esc(p.summary.owner)}` : ''}</div>
          <div class="prog"><span style="width:${p.summary.progress}%"></span></div>
          <div class="meta">${p.summary.progress}% completado · actualizado ${new Date(p.updated_at).toLocaleDateString('es-AR')}</div>
          <div class="acts"><a class="btn sm" href="/p/${encodeURIComponent(p.id)}">Abrir</a><button class="btn sm ghost" data-copy="${esc(p.id)}">🔗 Link cliente</button><button class="btn sm quiet" data-dup="${esc(p.id)}" data-name="${esc(p.client_name)}">Duplicar</button></div>
        </div>`).join('')}</div>` : `<div class="empty">${plans.length ? 'No hay planes que coincidan.' : 'Todavía no hay planes. Creá el primero con “Nuevo plan”.'}</div>`;
      document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const u = `${location.origin}/p/${b.dataset.copy}`; navigator.clipboard?.writeText(u).then(() => toast('Link copiado'), () => prompt('Link del cliente', u)); });
      document.querySelectorAll('[data-dup]').forEach(b => b.onclick = async () => {
        const name = prompt('Nombre del cliente para la copia:', b.dataset.name + ' (copia)'); if (!name) return;
        const j = await api('/api/plans', { method: 'POST', body: { duplicateOf: b.dataset.dup, name } }); location.href = `/p/${j.plan.id}`;
      });
    };
    $('#q').oninput = draw; draw();
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
  function wizard() {
    const today = D.today();
    const w = { step: 1, name: '', logo: '', color: '', country: 'AR', start: D.add(D.monday(today), 7), golive: D.add(D.monday(today), 7 + 70), stages: {}, integrations: [], contacts: [] };
    MODULES.forEach(m => w.stages[m.key] = 'off');
    const draw = () => {
      $('#app').innerHTML = `<div style="max-width:760px;margin:32px auto"><div class="card" style="display:flex;flex-direction:column;gap:16px">
        <div class="steps"><span class="on"></span><span class="${w.step >= 2 ? 'on' : ''}"></span><span class="${w.step >= 3 ? 'on' : ''}"></span></div>
        ${w.step === 1 ? step1() : w.step === 2 ? step2() : step3()}
        <div class="row" style="justify-content:space-between"><button class="btn ghost" id="back">${w.step === 1 ? 'Cancelar' : '← Atrás'}</button><button class="btn" id="next">${w.step === 3 ? 'Crear plan' : 'Siguiente →'}</button></div>
      </div></div>`;
      bind();
    };
    const step1 = () => `<h2 style="font-size:20px">Datos del cliente</h2>
      <label class="field"><span>Nombre de la empresa</span><input class="input" id="w-name" value="${esc(w.name)}" placeholder="Ej.: Estafeta"></label>
      <label class="field"><span>Logo (opcional) · si no lo cargás se muestra el nombre</span><input type="file" class="input" id="w-logo" accept="image/*"></label>
      <div class="logo-prev">${w.logo ? `<img src="${w.logo}" alt="">` : `<b style="font-size:20px;color:${esc(w.color || '#496be3')}">${esc(w.name || 'Nombre de la empresa')}</b>`}
        <span style="flex:1"></span><label class="row" style="gap:6px;font-size:12px">Color de marca <input type="color" id="w-color" value="${esc(w.color || '#496be3')}" style="width:40px;height:30px;border:0;background:none"></label></div>
      <div class="grid3">
        <label class="field"><span>País (feriados)</span><select class="input" id="w-country">${COUNTRIES.map(([k, v]) => `<option value="${k}" ${w.country === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Inicio de implementación</span><input type="date" class="input" id="w-start" value="${w.start}"></label>
        <label class="field"><span>Go-live previsto</span><input type="date" class="input" id="w-golive" value="${w.golive}"></label>
      </div>`;
    const step2 = () => `<h2 style="font-size:20px">Módulos</h2>
      <p class="muted" style="font-size:13px">Etapa 1 entra al cronograma (escalonado automáticamente) · Etapa 2 queda como post-lanzamiento. Después podés reordenar y mover todo desde el Gantt.</p>
      <div class="row"><button class="btn sm ghost" id="all1">Todos a Etapa 1</button><button class="btn sm ghost" id="none">Ninguno</button></div>
      <div class="modgrid">${CATS.map(c => `<div class="cat">${esc(c)}</div>${MODULES.filter(m => m.cat === c).map(m => `<div class="mod"><span>${esc(m.name)}</span><span class="seg">${[['e1', 'Etapa 1'], ['e2', 'Etapa 2'], ['off', '—']].map(([k, l]) => `<button class="${k} ${w.stages[m.key] === k ? 'on' : ''}" data-k="${m.key}" data-v="${k}">${l}</button>`).join('')}</span></div>`).join('')}`).join('')}</div>`;
    const step3 = () => `<h2 style="font-size:20px">Integraciones y contactos</h2>
      <p class="muted" style="font-size:13px">¿El cliente integra algún sistema (SAP, Workday, nómina, SSO…)? Corre en paralelo a los módulos.</p>
      <div id="ints" style="display:flex;flex-direction:column;gap:6px">${w.integrations.map((it, i) => `<div class="row" style="gap:6px"><input class="input" data-i="${i}" data-f="name" value="${esc(it.name)}" placeholder="Sistema (ej.: SAP)" style="flex:1"><input class="input" data-i="${i}" data-f="desc" value="${esc(it.desc)}" placeholder="Qué se integra (ej.: altas, bajas y estructura)" style="flex:2"><button class="icon-btn" data-rmi="${i}">✕</button></div>`).join('')}</div>
      <button class="btn sm ghost" id="addi" style="align-self:flex-start">＋ Agregar integración</button>
      <h3 style="font-size:16px;margin-top:8px">Contactos del cliente <span class="muted" style="font-weight:400;font-size:13px">(para recordatorios por mail · opcional)</span></h3>
      <div id="cts" style="display:flex;flex-direction:column;gap:6px">${w.contacts.map((c, i) => `<div class="row" style="gap:6px"><input class="input" data-c="${i}" data-f="name" value="${esc(c.name)}" placeholder="Nombre" style="flex:1"><input class="input" data-c="${i}" data-f="email" value="${esc(c.email)}" placeholder="mail" style="flex:1.4"><input class="input" data-c="${i}" data-f="role" value="${esc(c.role)}" placeholder="Rol" style="flex:.8"><button class="icon-btn" data-rmc="${i}">✕</button></div>`).join('')}</div>
      <button class="btn sm ghost" id="addc" style="align-self:flex-start">＋ Agregar contacto</button>`;
    const read = () => {
      if (w.step === 1) { w.name = $('#w-name').value.trim(); w.country = $('#w-country').value; w.start = $('#w-start').value; w.golive = $('#w-golive').value; w.color = $('#w-color').value; }
      if (w.step === 3) {
        document.querySelectorAll('[data-i]').forEach(i => w.integrations[i.dataset.i][i.dataset.f] = i.value.trim());
        document.querySelectorAll('[data-c]').forEach(i => w.contacts[i.dataset.c][i.dataset.f] = i.value.trim());
      }
    };
    const bind = () => {
      $('#back').onclick = () => { read(); if (w.step === 1) return listView(); w.step--; draw(); };
      $('#next').onclick = async () => {
        read();
        if (w.step === 1) { if (!w.name) return $('#w-name').focus(); if (!w.start || !w.golive || w.golive <= w.start) return alert('Revisá las fechas: el go-live tiene que ser posterior al inicio.'); }
        if (w.step === 2 && !Object.values(w.stages).includes('e1')) return alert('Elegí al menos un módulo para la Etapa 1.');
        if (w.step < 3) { w.step++; return draw(); }
        const data = buildPlan({
          client: { name: w.name, logo: w.logo, brandColor: w.color, contacts: w.contacts.filter(c => c.name || c.email) },
          humand: { name: me.name, email: me.email }, start: w.start, golive: w.golive, country: w.country,
          moduleKeys: MODULES.filter(m => w.stages[m.key] === 'e1').map(m => m.key),
          stage2Keys: MODULES.filter(m => w.stages[m.key] === 'e2').map(m => m.key),
          integrations: w.integrations.filter(i => i.name),
        });
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
    try { const j = await api('/api/me'); me = j.user; } catch { me = null; }
    if (!me) return loginView();
    listView();
  }
  boot();
})();
