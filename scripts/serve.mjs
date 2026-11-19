import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 4193);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('PORT must be an integer in 0..65535');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.map', 'application/json; charset=utf-8'],
]);
const within = (base, target) => {
  const suffix = relative(base, target);
  return suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
};
const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
  }
  try {
    let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) throw new URIError('Invalid path');
    if (pathname === '/') pathname = '/examples/index.html';
    const directory = pathname.startsWith('/examples/') ? 'examples' : pathname.startsWith('/dist/') ? 'dist' : undefined;
    if (!directory) { response.writeHead(404); response.end('Not found'); return; }
    const base = await realpath(resolve(root, directory));
    const candidate = resolve(root, `.${pathname}`);
    if (!within(base, candidate)) { response.writeHead(403); response.end('Forbidden'); return; }
    const target = await realpath(candidate);
    if (!within(base, target)) { response.writeHead(403); response.end('Forbidden'); return; }
    const contentType = mime.get(extname(target));
    if (!contentType || !(await stat(target)).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const badPath = error instanceof URIError;
    response.writeHead(badPath ? 400 : 404);
    response.end(badPath ? 'Invalid path' : 'Not found');
  }
});
server.on('error', error => { console.error(`Preview server failed: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`Ink Landscape preview: http://127.0.0.1:${address.port}/`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
