import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(process.env.INK_LANDSCAPE_ARTIFACT_DIR ?? join(tmpdir(), 'ink-landscape-checks'));
const suffix = relative(root, artifacts);
if (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Package artifacts must stay outside the repository');
await mkdir(artifacts, { recursive: true });
const run = await mkdtemp(join(artifacts, 'package-'));

async function npmCli() {
  const candidates = [process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  for (const directory of (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    candidates.push(join(directory, 'node_modules/npm/bin/npm-cli.js'));
    try { candidates.push(await realpath(join(directory, 'npm'))); } catch { /* Not this PATH entry. */ }
  }
  for (const candidate of candidates) if (candidate?.endsWith('npm-cli.js')) {
    try { await access(candidate); return candidate; } catch { /* Try another installed npm. */ }
  }
  throw new Error('Installed npm CLI not found; run npm run test:package');
}
function command(args, cwd, environment = {}) {
  const child = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, ...environment }, maxBuffer: 8 * 1024 * 1024 });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Command failed (${child.status}): ${args.join(' ')}\n${child.stdout}\n${child.stderr}`);
  return child.stdout;
}

try {
  const npm = await npmCli(), stage = join(run, 'source'), consumer = join(run, 'consumer');
  await mkdir(stage); await mkdir(consumer);
  for (const name of ['package.json', 'tsconfig.json', 'src', 'README.md', 'LICENSE', 'docs/techniques.md']) {
    await cp(join(root, name), join(stage, name), { recursive: true });
  }
  // This clean source tree has no dist. Only the already installed build tools
  // are linked; npm pack must run prepack and create every exported artifact.
  await symlink(join(root, 'node_modules'), join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const packLog = command([npm, 'pack', '--pack-destination', run], stage);
  await writeFile(join(run, 'pack.log'), packLog);
  const tarballs = (await readdir(run)).filter(name => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, 'pack must create exactly one archive');
  const tarball = join(run, tarballs[0]);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'ink-landscape-consumer-check', version: '1.0.0', private: true, type: 'module' }));
  command([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], consumer);
  const installed = join(consumer, 'node_modules', 'ink-landscape');
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.private, true);
  assert.equal(manifest.sideEffects, false);
  for (const entry of ['.', './core', './canvas', './brush', './cun', './ink', './ink-canvas', './subjects', './learning']) {
    assert.ok(Object.hasOwn(manifest.exports, entry), `Missing public package entry ${entry}`);
  }
  const entries = Object.entries(manifest.exports).filter(([name]) => name !== './package.json');
  for (const [name, entry] of entries) {
    assert.ok(entry.import?.endsWith('.js') && entry.types?.endsWith('.d.ts'), `${name} requires runtime and declaration exports`);
    await access(resolve(installed, entry.import)); await access(resolve(installed, entry.types));
  }
  assert.equal(manifest.exports['./package.json'], './package.json');
  await writeFile(join(consumer, 'loader.mjs'), `import { appendFile } from 'node:fs/promises';
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.startsWith('file:')) await appendFile(process.env.INK_LANDSCAPE_MODULE_TRACE, url + '\\n');
  return result;
}\n`);
  await writeFile(join(consumer, 'probe.mjs'), `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
assert.equal(typeof globalThis.document, 'undefined');
const api = await import(process.argv[2]);
assert.ok(Object.keys(api).length > 0);
if (api.createInkScene) {
  const builder = api.createInkScene({ width: 100, height: 100, seed: 7 });
  const mark = builder.stroke([{ x: 10, y: 10 }, { x: 80, y: 80 }]);
  if (api.composeInkScene) assert.equal(api.composeInkScene([{ namespace: 'a', source: mark }, { namespace: 'b', source: mark }], { width: 100, height: 100 }).marks.length, 2);
}
assert.equal(createRequire(import.meta.url)('ink-landscape/package.json').name, 'ink-landscape');
console.log(JSON.stringify({ specifier: process.argv[2], exports: Object.keys(api).length, withoutDOM: true }));\n`);
  const imports = [];
  for (const [name] of entries) {
    const specifier = 'ink-landscape' + (name === '.' ? '' : name.slice(1));
    const trace = join(run, (name === '.' ? 'root' : name.slice(2)) + '.modules.log');
    const output = command(['--loader', pathToFileURL(join(consumer, 'loader.mjs')).href, join(consumer, 'probe.mjs'), specifier], consumer,
      { INK_LANDSCAPE_MODULE_TRACE: trace });
    const modules = (await readFile(trace, 'utf8')).trim().split('\n');
    if (name === './core' || name === './canvas') {
      assert.ok(modules.some(url => url.includes('/node_modules/ink-landscape/dist/entrypoints/')), 'probe must load the installed package');
      assert.ok(!modules.some(url => /\/technique-(learning|catalog|studies)\.js$/.test(url)), `${name} imported research data`);
    }
    imports.push({ ...JSON.parse(output), modules: modules.length });
  }
  const source = entries.map(([name], index) => `import * as api${index} from '${'ink-landscape' + (name === '.' ? '' : name.slice(1))}';\nvoid api${index};`).join('\n');
  await writeFile(join(consumer, 'usage.ts'), source + `
import { createInkScene, composeInkScene, type InkScene } from 'ink-landscape/core';
import { renderCanvas } from 'ink-landscape/canvas';
import { createBrushDocument } from 'ink-landscape/brush';
const brush = createBrushDocument([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
const scene: InkScene = composeInkScene([{ namespace: 'brush', source: brush }], { width: 100, height: 100 });
const renderer: typeof renderCanvas = renderCanvas;
void [scene, renderer, createInkScene];\n`);
  const compiler = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  command([compiler, '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--target', 'ES2022', '--lib', 'ES2022,DOM', 'usage.ts'], consumer);
  const report = { passed: true, node: process.version, cleanSourcePack: true, installedConsumer: true,
    declarationsChecked: entries.length, packageJsonExport: true, lightweightGraphsChecked: ['core', 'canvas'],
    tarballBytes: (await stat(tarball)).size, imports };
  await writeFile(join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, artifacts: run }, null, 2));
} catch (error) {
  await writeFile(join(run, 'error.txt'), String(error.stack ?? error));
  console.error(`Package check failed; artifacts: ${run}`);
  throw error;
}
