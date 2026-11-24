import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(process.env.INK_LANDSCAPE_ARTIFACT_DIR ?? join(tmpdir(), 'ink-landscape-checks'));
const suffix = relative(root, artifacts);
if (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Browser artifacts must stay outside the repository');
await mkdir(artifacts, { recursive: true });
const run = await mkdtemp(join(artifacts, 'browser-'));
const server = spawn(process.execPath, [join(root, 'scripts/serve.mjs')], { cwd: root,
  env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let context, serverLog = '';
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });
try {
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview server did not start')), 15000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Preview server exited (${code})`)); });
    server.stdout.on('data', chunk => {
      serverLog += chunk.toString();
      const match = serverLog.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) { clearTimeout(timer); resolveUrl(match[0]); }
    });
  });
  // Own a fresh headless profile. Never connect to an existing user browser.
  context = await chromium.launchPersistentContext(join(run, 'profile'), { headless: true,
    ...(process.env.INK_LANDSCAPE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.INK_LANDSCAPE_CHROMIUM_EXECUTABLE } : {}),
    viewport: { width: 1024, height: 900 }, deviceScaleFactor: 1, downloadsPath: join(run, 'downloads') });
  const page = context.pages()[0] ?? await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(url + 'examples/library-verify.html', { waitUntil: 'load' });
  await page.waitForFunction(() => ['passed', 'failed'].includes(document.documentElement.dataset.verifyStatus), undefined, { timeout: 60000 });
  const report = JSON.parse(await page.locator('#results').textContent());
  report.pageErrors = errors; report.node = process.version;
  report.browserExecutable = process.env.INK_LANDSCAPE_CHROMIUM_EXECUTABLE ?? 'Playwright Chromium';
  await writeFile(join(run, 'report.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: join(run, 'verification.png'), fullPage: true });
  if (!report.passed || errors.length) throw new Error('Browser regression checks failed');
  console.log(JSON.stringify({ passed: true, checks: report.checks.length, artifacts: run }, null, 2));
} catch (error) {
  await writeFile(join(run, 'error.txt'), String(error.stack ?? error));
  console.error(`Browser check failed; artifacts: ${run}`);
  throw error;
} finally {
  try { await context?.close(); }
  finally { server.kill(); await writeFile(join(run, 'server.log'), serverLog); }
}
