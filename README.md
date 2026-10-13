# Plan de implementación · Humand

Generador de planes de trabajo para clientes: cronograma tipo Gantt, minutas con tareas y recordatorios por mail, y novedades de producto tomadas de Notion.

- **`/`**: panel del equipo Humand (contraseña de equipo). Desde acá se listan, crean y duplican planes.
- **`/p/<id>`**: link del plan. Si entrás con sesión del equipo, ves la barra de edición; el cliente ve el mismo link en **solo lectura** (la API rechaza cualquier cambio sin sesión).

## Qué incluye

- Logo del cliente (o el nombre si no hay logo) y color de marca tomado automáticamente del logo.
- Gantt por días con semanas, feriados por país (elegibles y editables), línea de "hoy", filas que se reordenan arrastrando ⠿ y barras que se mueven o estiran con el mouse.
- Plan original vs. real: si una etapa se corre, queda la barra punteada original y podés agregar una nota con "＋" (atraso, adelanto o nota; visible o solo interna).
- Tildar etapas y tareas → se pintan de verde (también en el PDF/HTML del cliente).
- Integraciones (SAP, nómina, SSO…) corriendo en paralelo, con su propia sección.
- Organización de reuniones: dedicación esperada y agenda semanal generada a partir del cronograma.
- Minutas: pegás la minuta y se detectan las tareas (responsable con @, "Responsable:", fechas dd/mm). Cada tarea tiene 🔔 para enviar ya, programar o avisar 1 día antes del vencimiento. Opcional: resumen semanal automático.
- Producto: novedades de la base **Humand Product Updates** de Notion filtradas por los módulos del plan, más respuestas cargadas a mano. Se puede ocultar cada novedad.
- Exportar PDF o HTML eligiendo qué secciones incluir (progreso real, minutas, novedades, agenda, etc.).

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service role (solo del lado del servidor) |
| `ADMIN_PASSWORD` | Contraseña compartida del equipo Humand |
| `SESSION_SECRET` | Texto largo al azar para firmar las sesiones |
| `CRON_SECRET` | Texto al azar; Vercel lo usa para llamar a `/api/cron` |
| `NOTION_TOKEN` | Token de una integración interna de Notion con acceso a la base "Product Updates" |
| `NOTION_UPDATES_DB_ID` | Opcional. Por defecto `03efef8f22f74ddaa5b5839ed670a42d` |
| `RESEND_API_KEY` | API key de [Resend](https://resend.com) para enviar mails |
| `MAIL_FROM` | Remitente, ej.: `Humand Implementación <implementacion@humand.co>` (dominio verificado en Resend) |
| `PUBLIC_BASE_URL` | Opcional. URL pública para los links de los mails |

### Notion
1. En Notion → Settings → Connections → *Develop or manage integrations* → nueva integración interna (solo lectura).
2. En la página **Humand Product Updates** (CX Partners) → ⋯ → *Connections* → agregar la integración.
3. Copiar el token en `NOTION_TOKEN`.

### Mails
Crear cuenta en Resend, verificar el dominio del remitente y cargar `RESEND_API_KEY` y `MAIL_FROM`. El cron corre todos los días a las 8:00 (hora Argentina) y envía los recordatorios programados y los resúmenes semanales.

## Base de datos
Ejecutar `supabase/migration.sql` en el proyecto Supabase. Las tablas tienen RLS activo sin políticas: solo el servidor (service role) puede leer y escribir.

## Desarrollo local
```bash
npm run dev     # http://localhost:3000 · contraseña local: humand
```
Sin variables de entorno, los datos se guardan en `.data/db.json`, los mails en `.data/outbox/` y las novedades se leen de `.data/notion-fixture.json`.
