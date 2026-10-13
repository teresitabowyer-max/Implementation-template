// Catálogo de módulos Humand, hitos estructurales y utilidades de fechas compartidas.
(function (g) {
  const HC = 'https://help.humand.co/hc/es-419/';
  const S = HC + 'sections/';

  // [clave, nombre, categoría, link Help Center, módulos equivalentes en Notion "Product Updates", semanas sugeridas]
  const MODULES = [
    ['muro', 'Muro', 'Comunicación', S + '26815315326483-Muro', ['Feed', 'Feed & Groups'], 2],
    ['noticias', 'Noticias', 'Comunicación', S + '21700115311763-Noticias', ['Feed'], 2],
    ['chats', 'Chats', 'Comunicación', S + '25787942154643-Chats', ['Chats'], 1],
    ['accesos', 'Accesos directos', 'Comunicación', S + '21704134753171-Accesos-r%C3%A1pidos', ['General'], 1],
    ['librerias', 'Librerías de conocimiento', 'Comunicación', S + '21704219667091-Librer%C3%ADas-de-Conocimiento', ['Knowledge Libraries'], 2],
    ['grupos', 'Grupos', 'Comunicación', S + '26848382174867-Grupos', ['Groups', 'Feed & Groups'], 1],
    ['organigrama', 'Organigrama', 'Comunicación', HC, ['Org Chart'], 2],
    ['perfiles', 'Perfiles', 'Comunicación', HC, ['Profile', 'HRIS', 'HRIS & Users', 'Users'], 2],
    ['vacaciones', 'Vacaciones y permisos', 'Gestión de RR. HH.', S + '21704266658067-Vacaciones-y-permisos', ['Time Off'], 4],
    ['documentos', 'Documentos personales', 'Gestión de RR. HH.', S + '21704056799635-Documentos-Personales', ['Documents', 'Personal Documents', 'Legajo Digital'], 3],
    ['onboarding', 'Onboarding', 'Gestión de RR. HH.', S + '21703883686035-Onboarding', ['Onboarding'], 3],
    ['archivos', 'Archivos', 'Gestión de RR. HH.', S + '21704011299219-Archivos', ['Files'], 1],
    ['servicios', 'Gestión de servicios', 'Operaciones', S + '35012282005011-Gesti%C3%B3n-de-Servicios', ['Service Management', 'Service Management & General'], 4],
    ['asistencia', 'Control de asistencia', 'Operaciones', S + '30059171421587-Control-de-Asistencia', ['Time Tracking', 'Time Planning'], 5],
    ['formularios', 'Formularios', 'Operaciones', S + '21686518989587-Formularios', [], 2],
    ['marketplace', 'Marketplace', 'Cultura', HC, [], 2],
    ['reconocimientos', 'Reconocimientos', 'Cultura', S + '21703992858515-Reconocimientos', ['Kudos'], 2],
    ['cumples', 'Cumpleaños y aniversarios', 'Cultura', S + '25823733037203-Aniversarios-y-Cumplea%C3%B1os', [], 1],
    ['eventos', 'Eventos', 'Cultura', S + '38339073387155-Eventos', ['Events'], 1],
    ['px', 'Clima laboral', 'Cultura', S + '30008085105683-People-Experience', [], 3],
    ['encuestas', 'Encuestas', 'Cultura', S + '21700166783507-Encuestas', [], 1],
    ['desempeno', 'Evaluación de desempeño', 'Desarrollo de talento', S + '26763849007251-Desempe%C3%B1o', ['Performance', 'Competencies'], 5],
    ['objetivos', 'Objetivos', 'Desarrollo de talento', S + '29165322280211-Objetivos', ['Goals'], 3],
    ['capacitacion', 'Capacitación', 'Desarrollo de talento', S + '28333106769555-Cursos', ['Courses', 'Learning', 'Learning - Courses', 'Learning - Sessions', 'Sessions'], 4],
    ['reclutamiento', 'Reclutamiento', 'Desarrollo de talento', HC + 'search?query=reclutamiento', ['Reclutamiento (ATS)'], 4],
  ].map(([key, name, cat, hc, notion, weeks]) => ({ key, name, cat, hc, notion, weeks }));

  const CATS = [...new Set(MODULES.map(m => m.cat))];

  // Hitos estructurales (se pueden quitar o renombrar en cada plan)
  const MILESTONES = [
    { key: 'refinamiento', name: 'Refinamiento del plan de trabajo', label: 'Refinamiento', at: 'start', weeks: 1 },
    { key: 'kickoff', name: 'Kick-off · Altas y configuraciones iniciales', label: 'Kick-off · Altas', at: 'week2', weeks: 1 },
    { key: 'qa', name: 'Revisión de comunidad y QA', label: 'QA integral', at: 'preend', weeks: 2 },
    { key: 'comunicacion', name: 'Plan de comunicación y lanzamiento', label: 'Comunicación', at: 'end1', weeks: 1 },
    { key: 'golive', name: 'Lanzamiento', label: '★ Go-live', at: 'golive', weeks: 1 },
  ];

  const COUNTRIES = [
    ['AR', 'Argentina'], ['BO', 'Bolivia'], ['BR', 'Brasil'], ['CL', 'Chile'], ['CO', 'Colombia'], ['CR', 'Costa Rica'],
    ['DO', 'Rep. Dominicana'], ['EC', 'Ecuador'], ['SV', 'El Salvador'], ['ES', 'España'], ['US', 'Estados Unidos'],
    ['GT', 'Guatemala'], ['HN', 'Honduras'], ['MX', 'México'], ['NI', 'Nicaragua'], ['PA', 'Panamá'], ['PY', 'Paraguay'],
    ['PE', 'Perú'], ['UY', 'Uruguay'], ['VE', 'Venezuela'],
  ];

  // ---------- fechas (siempre ISO yyyy-mm-dd, sin zona horaria) ----------
  const D = {
    parse: s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); },
    iso: dt => dt.toISOString().slice(0, 10),
    add: (s, n) => { const t = D.parse(s); t.setUTCDate(t.getUTCDate() + n); return D.iso(t); },
    diff: (a, b) => Math.round((D.parse(b) - D.parse(a)) / 864e5),
    dow: s => (D.parse(s).getUTCDay() + 6) % 7, // 0 = lunes
    monday: s => D.add(s, -D.dow(s)),
    today: () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; },
    MONTHS: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    MONTHS_L: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    short: s => { if (!s) return ''; const t = D.parse(s); return `${t.getUTCDate()} ${D.MONTHS[t.getUTCMonth()]}`; },
    long: s => { if (!s) return ''; const t = D.parse(s); return `${t.getUTCDate()} de ${D.MONTHS_L[t.getUTCMonth()]} de ${t.getUTCFullYear()}`; },
    dmy: s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; },
    range: (a, b) => {
      const A = D.parse(a), B = D.parse(b);
      return A.getUTCMonth() === B.getUTCMonth() ? `${A.getUTCDate()}–${B.getUTCDate()} ${D.MONTHS[B.getUTCMonth()]}` : `${D.short(a)}–${D.short(b)}`;
    },
  };

  const uid = () => Math.random().toString(36).slice(2, 10);

  // Arma un plan inicial escalonado, con la misma lógica que el plan de Estafeta.
  function buildPlan({ client, humand, start, golive, country, moduleKeys, stage2Keys = [], integrations = [] }) {
    const s = D.monday(start);
    const g = D.monday(golive);
    const weeks = Math.max(4, Math.round(D.diff(s, g) / 7) + 1);
    const wk = (n, len = 1) => ({ start: D.add(s, (n - 1) * 7), end: D.add(s, (n - 1) * 7 + len * 7 - 3) }); // lunes → viernes
    const rows = [];
    const push = r => { r.baseStart = r.start; r.baseEnd = r.end; rows.push({ id: uid(), done: false, status: 'pending', owner: '', notes: [], ...r }); };

    push({ type: 'milestone', key: 'refinamiento', name: 'Refinamiento del plan de trabajo', label: 'Refinamiento', ...wk(1) });
    push({ type: 'milestone', key: 'kickoff', name: 'Kick-off · Altas y configuraciones iniciales', label: 'Kick-off · Altas', ...wk(2) });

    const mods = MODULES.filter(m => moduleKeys.includes(m.key));
    const firstW = 3, lastW = Math.max(firstW, weeks - 2);
    const span = lastW - firstW + 1;
    mods.forEach((m, i) => {
      const len = Math.max(1, Math.min(m.weeks, span));
      const startW = mods.length > 1 ? firstW + Math.round((i * Math.max(0, span - len)) / (mods.length - 1)) : firstW;
      push({ type: 'module', key: m.key, name: m.name, cat: m.cat, hc: m.hc, label: 'Configuración', ...wk(startW, len) });
    });
    integrations.forEach(it => {
      push({ type: 'integration', name: `Integración con ${it.name}`, label: 'Trabajo en paralelo · sincronización continua', integration: it, ...wk(firstW, Math.max(1, lastW - firstW + 1)) });
    });
    push({ type: 'milestone', key: 'qa', name: 'Revisión de comunidad y QA', label: 'QA integral', ...wk(Math.max(3, weeks - 2), 2) });
    push({ type: 'milestone', key: 'comunicacion', name: 'Plan de comunicación y lanzamiento', label: 'Comunicación', ...wk(Math.max(3, weeks - 1)) });
    const gl = wk(weeks);
    push({ type: 'golive', key: 'golive', name: 'Lanzamiento', label: '★ Go-live', start: gl.start, end: gl.start });

    return {
      version: 2,
      client: { name: client.name, logo: client.logo || '', brandColor: client.brandColor || '', country: country || 'AR', contacts: client.contacts || [] },
      humand: humand || {},
      dates: { start: s, golive: gl.start, issued: D.today() },
      rows,
      stage2: stage2Keys,
      holidays: { country: country || 'AR', list: [], hidden: [], custom: [] },
      summary: {
        weeklyText: 'Se mantendrán reuniones semanales de 60 minutos para garantizar el cumplimiento del plan de trabajo. Adicionalmente, el soporte técnico estará disponible por WhatsApp.',
        meetingsPerWeek: 2, meetingMinutes: 60,
      },
      dedication: {
        percent: 30, hours: 10,
        text: `El proyecto requiere aproximadamente 30% de la capacidad semanal del equipo responsable de cada módulo. Esto equivale a ~10 horas por semana entre reuniones, preparación y configuración activa. La dedicación aumenta en QA y go-live.`,
        phases: [
          { name: 'Inicio', client: '20%', humand: '4 hs/semana' },
          { name: 'Módulos', client: '30–35%', humand: '4 hs/semana' },
          { name: 'QA y cierre', client: '40–45%', humand: '4 hs/semana' },
          { name: 'Go-live', client: '60–70%', humand: '4 hs/semana' },
        ],
      },
      agenda: {},           // overrides por semana: { 'yyyy-mm-dd(lunes)': { title, notes } }
      minutas: [],
      updates: { manual: [], hidden: [], days: 120 },
      settings: {
        showProgress: true, showBaseline: true, showToday: true, showHolidays: true,
        showUpdates: true, showMinutas: true, showAgenda: true, showDedication: true, showIntegrations: true,
        digest: { on: false, weekday: 1, to: [], cc: [] },
      },
    };
  }

  g.CATALOG = { MODULES, CATS, MILESTONES, COUNTRIES, HC, D, uid, buildPlan };
})(window);
