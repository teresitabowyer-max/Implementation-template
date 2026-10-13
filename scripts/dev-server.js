// Servidor local que imita Vercel: sirve /public y ejecuta /api/*.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const PORT = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/api/')) {
      const file = path.join(root, 'api', u.pathname.slice(5) + '.js');
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('no api'); }
      const mod = await import(pathToFileURL(file).href + '?t=' + fs.statSync(file).mtimeMs);
      return await mod.default(req, res);
    }
    let p = u.pathname;
    if (p.startsWith('/p/')) p = '/plan.html';
    if (p === '/') p = '/index.html';
    let file = path.join(root, 'public', p);
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); res.statusCode = 500; res.end(String(e)); }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
