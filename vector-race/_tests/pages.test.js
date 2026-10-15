import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.trk': 'text/plain', '.zip': 'application/zip' };

test('GitHub Pages: all runtime URLs work at the site root and under a repository subpath', async t => {
  const prefixes = ['/vector-race/', '/MathieuVavrille.github.io/vector-race/'];
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const prefix = prefixes.find(p => pathname.startsWith(p));
      if (!prefix) throw new Error('Outside game');
      const filename = pathname.slice(prefix.length) || 'index.html';
      const target = path.resolve(root, filename);
      if (!target.startsWith(root) || !(await stat(target)).isFile()) throw new Error('Missing file');
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
      res.end(await readFile(target));
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const prefix of prefixes) {
    const entry = new URL(prefix, origin);
    const response = await fetch(entry);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert(!html.startsWith('---'), 'Static HTML must not inherit a Jekyll layout');
    const queue = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map(m => new URL(m[1], entry));
    const seen = new Set();
    while (queue.length) {
      const url = queue.pop();
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      assert.equal(url.origin, origin, 'Game assets must be self-contained');
      assert(url.pathname.startsWith(prefix), `Asset escaped game directory: ${url}`);
      const asset = await fetch(url);
      assert.equal(asset.status, 200, `Missing asset: ${url}`);
      if (url.pathname.endsWith('.js')) {
        assert.match(asset.headers.get('content-type'), /javascript/);
        const source = await asset.text();
        const imports = /(?:from\s*|import\s*\(|new URL\s*\(|fetch\s*\()\s*['"](\.\/[^'"]+)['"]/g;
        for (const match of source.matchAll(imports)) {
          // launch.trk is supplied only by the optional local Python launcher.
          if (match[1] !== './launch.trk') queue.push(new URL(match[1], url));
        }
      }
    }
    for (const asset of ['app.js', 'style.css', 'solver-worker.js', 'original.trk', 'locales.js', 'vector-race-sources.zip']) {
      assert(seen.has(new URL(asset, entry).href), `Runtime dependency was not checked: ${asset}`);
    }
  }
});
