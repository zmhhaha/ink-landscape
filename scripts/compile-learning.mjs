import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TECHNIQUE_CATALOG, TECHNIQUE_CATEGORIES, TECHNIQUE_SOURCES } from '../dist/technique-catalog.js';

// The four authored notebooks are the source of truth. This checks coverage,
// resolves duplicate source URLs and produces the library data and reading book.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chapters = ['brush-calligraphy', 'ink-water', 'texture-vegetation', 'linework'];
const titles = ['运笔与书法', '墨法与水法', '皴法与树叶', '勾描与衣纹'];
const inputs = await Promise.all(chapters.map(async name => JSON.parse(await readFile(resolve(root, `docs/learning/${name}.json`), 'utf8'))));
const sourceById = new Map(), canonicalByUrl = new Map(), remap = new Map();
const declaredUrls = new Map(TECHNIQUE_SOURCES.map(source => [source.id, source.url]));
for (const source of TECHNIQUE_SOURCES) if (!canonicalByUrl.has(source.url)) canonicalByUrl.set(source.url, source.id);
for (const input of inputs) for (const source of input.sources) {
  for (const field of ['id', 'title', 'institution', 'url', 'accessed', 'kind', 'scope', 'supports']) {
    if (typeof source[field] !== 'string' || !source[field].trim()) throw new Error(`Source missing ${field}: ${source.id}`);
  }
  const url = new URL(source.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`Invalid source URL: ${source.id}`);
  if (declaredUrls.has(source.id) && declaredUrls.get(source.id) !== source.url) throw new Error(`Conflicting URLs for source ID: ${source.id}`);
  declaredUrls.set(source.id, source.url);
  if (!['museum', 'historical-transcription', 'teaching', 'research'].includes(source.kind)) throw new Error(`Invalid source kind: ${source.id}`);
  const canonical = canonicalByUrl.get(source.url) ?? source.id;
  canonicalByUrl.set(source.url, canonical);
  if (remap.has(source.id) && remap.get(source.id) !== canonical) throw new Error(`Conflicting source ID: ${source.id}`);
  remap.set(source.id, canonical);
  const previous = sourceById.get(canonical);
  if (previous && previous.url !== source.url) throw new Error(`Conflicting canonical source URL: ${canonical}`);
  sourceById.set(canonical, previous ? { ...previous,
    scope: [...new Set([previous.scope, source.scope])].join('；'),
    supports: [...new Set([previous.supports, source.supports])].join('；'),
  } : { ...source, id: canonical });
}
const originals = new Map(TECHNIQUE_CATALOG.map(item => [item.id, item]));
const notes = new Map();
for (const input of inputs) for (const note of input.entries) {
  if (!originals.has(note.id) || notes.has(note.id)) throw new Error(`Unknown or duplicate entry: ${note.id}`);
  for (const field of ['summary', 'actions', 'appearance', 'application', 'pitfall', 'translation']) {
    if (typeof note[field] !== 'string' || note[field].trim().length < 12) throw new Error(`Insubstantial ${field}: ${note.id}`);
  }
  if (!['supported', 'partial', 'disputed', 'unresolved'].includes(note.confidence)) throw new Error(`Invalid reading confidence: ${note.id}`);
  if (!Array.isArray(note.evidence) || !note.evidence.length) throw new Error(`Missing reading evidence: ${note.id}`);
  const evidence = note.evidence.map(item => {
    const sourceId = remap.get(item.sourceId);
    if (!sourceId || !sourceById.has(sourceId)) throw new Error(`Unknown reading source ${item.sourceId}: ${note.id}`);
    if (!['definition', 'example', 'mentioned'].includes(item.support) || !item.locator?.trim() || typeof item.note !== 'string') throw new Error(`Incomplete citation: ${note.id}`);
    return { ...item, sourceId };
  });
  const original = originals.get(note.id);
  notes.set(note.id, { ...note, name: original.name, category: original.category, evidence });
}
const missing = TECHNIQUE_CATALOG.filter(item => !notes.has(item.id));
if (missing.length || notes.size !== 100) throw new Error(`Reading coverage must be 100/100; missing: ${missing.map(item => item.id).join(', ')}`);
const orderedNotes = TECHNIQUE_CATALOG.map(item => notes.get(item.id));
const sources = [...sourceById.values()];
const statuses = Object.fromEntries(['supported', 'partial', 'disputed', 'unresolved'].map(status => [status, orderedNotes.filter(note => note.confidence === status).length]));
const labels = { supported: '有明确支持', partial: '部分支持', disputed: '存在异说', unresolved: '操作释义未确证' };
const fields = [['动作', 'actions'], ['笔迹观察', 'appearance'], ['适用范围', 'application'], ['误区与边界', 'pitfall'], ['程序转译假设', 'translation']];
function renderNotes(list) {
  return list.map(note => `<a id="${note.id}"></a>\n\n## ${note.name} · ${note.id}\n\n${note.summary}\n\n阅读状态：${labels[note.confidence]}。\n\n${fields.map(([label, key]) => `**${label}：** ${note[key]}`).join('\n\n')}\n\n${note.evidence.map(item => { const source = sourceById.get(item.sourceId); return `- [${source.title}](${source.url})；定位：${item.locator}；支持类型：${item.support}。${item.note}`; }).join('\n')}\n`).join('\n');
}
for (let index = 0; index < chapters.length; index++) {
  const ids = new Set(inputs[index].entries.map(note => note.id));
  await writeFile(resolve(root, `docs/learning/${chapters[index]}.md`), `# ${titles[index]}：逐项阅读笔记\n\n由同名JSON编排，阅读日期2026-11-19。这里记录资料理解、可见目标与程序假设，未把阅读进度升级为代码实现或艺术验收。\n\n${renderNotes(orderedNotes.filter(note => ids.has(note.id)))}`, 'utf8');
}
const typeSource = `// Generated by scripts/compile-learning.mjs from docs/learning/*.json.\n// Reading evidence is independent of implementation and artistic validation.\nexport type TechniqueReadingConfidence = 'supported' | 'partial' | 'disputed' | 'unresolved';\nexport interface TechniqueReadingSource {\n  readonly id: string; readonly title: string; readonly institution: string; readonly url: string;\n  readonly accessed: string; readonly kind: 'museum' | 'historical-transcription' | 'teaching' | 'research';\n  readonly scope: string; readonly supports: string;\n}\nexport interface TechniqueReadingNote {\n  readonly id: string; readonly name: string; readonly category: string;\n  readonly summary: string; readonly actions: string; readonly appearance: string; readonly application: string;\n  readonly pitfall: string; readonly translation: string; readonly confidence: TechniqueReadingConfidence;\n  readonly evidence: readonly { readonly sourceId: string; readonly locator: string; readonly support: 'definition' | 'example' | 'mentioned'; readonly note: string }[];\n}\nfunction freeze<T>(value: T): T {\n  if (value && typeof value === 'object' && !Object.isFrozen(value)) {\n    for (const item of Object.values(value)) freeze(item);\n    Object.freeze(value);\n  }\n  return value;\n}\nexport const TECHNIQUE_READING_SOURCES = freeze<readonly TechniqueReadingSource[]>(${JSON.stringify(sources, null, 2)});\nexport const TECHNIQUE_READINGS = freeze<readonly TechniqueReadingNote[]>(${JSON.stringify(orderedNotes, null, 2)});\nexport function getTechniqueReading(id: string): TechniqueReadingNote | undefined { return TECHNIQUE_READINGS.find(note => note.id === id); }\n`;
await writeFile(resolve(root, 'src/technique-learning.ts'), typeSource, 'utf8');
const chapterRows = chapters.map((name, index) => `| [${titles[index]}](${name}.md) | ${inputs[index].entries.length} |`).join('\n');
const summary = `# 100项笔墨技法学习总册\n\n本轮已逐项阅读并写成100份笔记，覆盖基础运笔21项、墨态墨法15项、水法6项、山石皴法16项、树叶苔点12项、勾描衣纹22项、永字八法8项。每项分别记动作、笔迹观察、适用范围、常见误解、程序转译假设和出处定位。\n\n100/100表示每项完成了资料阅读与问题分析，不表示100项都有唯一可靠定义，更不表示已经实现或掌握传统用笔。当前${sources.length}个去重正文来源：明确支持${statuses.supported}项、部分支持${statuses.partial}项、存在异说${statuses.disputed}项、操作释义未确证${statuses.unresolved}项。后两类保留为具体研究结论，不用臆造定义补齐数字。\n\n| 分册 | 条目数 |\n| --- | ---: |\n${chapterRows}\n\n## 逐项索引\n\n${TECHNIQUE_CATEGORIES.map(category => `### ${category.name}\n\n${orderedNotes.filter(note => note.category === category.id).map(note => { const chapter = inputs.findIndex(input => input.entries.some(item => item.id === note.id)); return `- [${note.name}](${chapters[chapter]}.md#${note.id})：${note.summary}（${labels[note.confidence]}）`; }).join('\n')}`).join('\n\n')}\n\n## 来源与阅读范围\n\n${sources.map(source => `- **[${source.title}](${source.url})** · ${source.institution} · ${source.kind} · ${source.accessed}\n  阅读范围：${source.scope}\n  支持内容：${source.supports}`).join('\n\n')}\n\n## 如何继续验证\n\n先用已有纯数据笔路做同题与换形对照，再核对可使用的作品局部或实际运笔示范。文献支持、动作假设、程序实现和视觉认可分别记录。所有目录艺术状态继续为unreviewed；本轮没有批量生成名不副实的笔刷。\n\n分册JSON是可维护源文件。更新后运行npm run learning:build重新校验覆盖、引用并生成分册与库内阅读数据；生成器不会下载资料或更改笔触渲染。\n`;
await writeFile(resolve(root, 'docs/learning/README.md'), summary, 'utf8');
console.log(JSON.stringify({ coverage: `${notes.size}/${TECHNIQUE_CATALOG.length}`, sources: sources.length, confidence: statuses, chapters: Object.fromEntries(chapters.map((name, index) => [name, inputs[index].entries.length])) }, null, 2));
