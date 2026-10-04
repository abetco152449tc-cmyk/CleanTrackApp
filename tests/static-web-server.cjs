/* global __dirname */
// Optional production-bundle host for browser tests on machines with slow Metro startup.
const { spawn } = require('node:child_process');
const { createReadStream, existsSync, statSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex < 0 ? 8081 : args[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid test server port.');
const outputDir = args.includes('--demo') ? '.tools/demo-dist' : '.tools/firebase-dist';
const root = path.resolve(projectRoot, outputDir);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
let server;
const exporter = spawn(
  process.execPath,
  [
    path.join(projectRoot, 'node_modules/expo/bin/cli'),
    'export',
    '--platform',
    'web',
    '--output-dir',
    outputDir,
    '--clear',
    '--max-workers',
    '2',
  ],
  { cwd: projectRoot, env: process.env, stdio: 'inherit' },
);
exporter.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
exporter.on('exit', (code) => {
  if (code !== 0) {
    process.exitCode = code || 1;
    return;
  }
  server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const candidate = path.resolve(root, `.${pathname}`);
      if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const options = [candidate, `${candidate}.html`, path.join(candidate, 'index.html')];
      let file = options.find((item) => existsSync(item) && statSync(item).isFile());
      // Dynamic report IDs are routed by Expo Router after the app hydrates.
      if (!file && !path.extname(pathname)) file = path.join(root, 'index.html');
      if (!file) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).pipe(response);
    } catch {
      response.writeHead(400).end();
    }
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`Serving ${outputDir} at http://127.0.0.1:${port}`),
  );
});
function shutdown() {
  if (exporter.exitCode === null) exporter.kill();
  if (server) server.close(() => process.exit());
  else process.exit();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
