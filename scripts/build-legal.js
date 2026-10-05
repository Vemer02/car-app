#!/usr/bin/env node
/**
 * Собирает юридические документы из legal/*.md и legal/operator.json:
 *   - src/legal/generated.ts   — тексты для экранов внутри приложения (работают без сети);
 *   - public/privacy.html, public/consent.html, public/delete-account.html — публичные страницы
 *     для Firebase Hosting (ссылки на политику и на удаление данных требует Google Play).
 * Запуск после любой правки текстов или данных оператора:  node scripts/build-legal.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, content) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), content);
};

const operator = JSON.parse(read('legal/operator.json'));
const missing = new Set();

function substitute(text) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = operator[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.add(key);
      return `[НЕ ЗАПОЛНЕНО: ${key}]`;
    }
    return String(value).trim();
  });
}

/** Минимальный разбор Markdown: заголовки, абзацы, маркированные списки. */
function parseBlocks(markdown) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: 'ul', items: list });
    list = null;
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (!line) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: `h${heading[1].length}`, text: heading[2] });
    } else if (line.startsWith('- ')) {
      flushParagraph();
      (list = list || []).push(line.slice(2));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

const DOCS = [
  { id: 'privacy', file: 'legal/privacy-policy.md', urlPath: '/privacy' },
  { id: 'consent', file: 'legal/consent.md', urlPath: '/consent' },
  // Только публичная страница (в приложении эта инструкция — сама кнопка удаления).
  { id: 'delete-account', file: 'legal/delete-account.md', urlPath: '/delete-account' },
];

const built = DOCS.map((doc) => {
  const blocks = parseBlocks(substitute(read(doc.file)));
  const titleBlock = blocks.find((b) => b.type === 'h1');
  return {
    id: doc.id,
    title: titleBlock ? titleBlock.text : doc.id,
    blocks: blocks.filter((b) => b !== titleBlock),
    urlPath: doc.urlPath,
  };
});

// ---- src/legal/generated.ts -------------------------------------------------

const version = Number(operator.version);
if (!Number.isInteger(version) || version < 1) {
  console.error('legal/operator.json: version должна быть целым числом >= 1');
  process.exit(1);
}

const byId = Object.fromEntries(built.map((d) => [d.id, d]));
write(
  'src/legal/generated.ts',
  `// АВТОГЕНЕРАЦИЯ: node scripts/build-legal.js — не редактируйте вручную,
// правьте legal/*.md и legal/operator.json.
import type { LegalDocument } from './types';

/** Редакция документов. Если у пользователя принята более ранняя — приложение попросит согласие заново. */
export const LEGAL_VERSION = ${version};

export const PRIVACY_POLICY: LegalDocument = ${JSON.stringify(byId.privacy, null, 2)};

export const PD_CONSENT: LegalDocument = ${JSON.stringify(byId.consent, null, 2)};
`,
);

// ---- public/*.html ----------------------------------------------------------

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s,<]+[^\s,.<])/g, '<a href="$1">$1</a>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.-]+[a-z])/gi, '<a href="mailto:$1">$1</a>');

function renderHtml(doc) {
  const others = built.filter((d) => d.id !== doc.id);
  let sectionIndex = 0;
  const toc = [];
  const body = doc.blocks
    .map((b) => {
      if (b.type === 'h2') {
        const id = `s${++sectionIndex}`;
        toc.push(`<li><a href="#${id}">${inline(b.text)}</a></li>`);
        return `<h2 id="${id}">${inline(b.text)}</h2>`;
      }
      if (b.type === 'h3') return `<h3>${inline(b.text)}</h3>`;
      if (b.type === 'ul') return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
      return `<p>${inline(b.text)}</p>`;
    })
    .join('\n');
  const [lead, ...rest] = body.split('\n');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(doc.title)} — Автолюбитель</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">
<style>
  :root {
    --bg: #F7F8FA; --surface: #FFFFFF; --border: #E4E7EB;
    --text: #14171A; --muted: #6B7280; --accent: #2563EB;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0D0F12; --surface: #16191D; --border: #2A2F36; --text: #F4F5F7; --muted: #9AA1AB; --accent: #3D8BFF; }
  }
  * { box-sizing: border-box; }
  html { scroll-padding-top: 16px; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.65 Manrope, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px);
  }
  main { max-width: 68ch; margin: 0 auto; padding: 40px 20px 64px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; margin-bottom: 36px; }
  .mark { width: 32px; height: 32px; border-radius: 9px; background: var(--accent); display: grid; place-items: center; }
  h1 { font-size: clamp(26px, 5vw, 34px); line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 8px; font-weight: 800; }
  .lead { color: var(--muted); margin: 0 0 28px; }
  nav { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px 18px; margin-bottom: 36px; }
  nav p { margin: 0 0 6px; font-weight: 700; }
  nav ol { margin: 0; padding-left: 0; list-style: none; columns: 2 220px; column-gap: 24px; }
  nav li { margin: 2px 0; break-inside: avoid; }
  h2 { font-size: 20px; line-height: 1.35; margin: 40px 0 10px; font-weight: 700; }
  h3 { font-size: 17px; margin: 24px 0 8px; }
  p, ul { margin: 0 0 14px; }
  ul { padding-left: 22px; }
  li { margin: 4px 0; }
  a { color: var(--accent); text-underline-offset: 3px; overflow-wrap: anywhere; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
  strong { font-weight: 700; }
  footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<main>
  <div class="brand">
    <span class="mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-6a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 6"/><rect x="1" y="13" width="22" height="7" rx="1.5"/></svg></span>
    Автолюбитель
  </div>
  <h1>${escapeHtml(doc.title)}</h1>
  ${lead.replace('<p>', '<p class="lead">')}
  ${toc.length > 2 ? `<nav aria-label="Содержание"><p>Содержание</p><ol>${toc.join('')}</ol></nav>` : ''}
  ${rest.join('\n')}
  <footer>См. также: ${others.map((d) => `<a href="${d.urlPath}">${escapeHtml(d.title)}</a>`).join(' · ')}</footer>
</main>
</body>
</html>
`;
}

for (const doc of built) write(`public${doc.urlPath}.html`, renderHtml(doc));

console.log(`Готово: редакция ${version}. Сгенерированы src/legal/generated.ts и public/*.html (${built.map((d) => d.urlPath.slice(1)).join(', ')})`);
console.log('Не забудьте: эти страницы отдаёт сервер mygarazh-server, не это приложение —');
console.log('скопируйте public/*.html в папку public/ репозитория сервера и разверните его заново.');
if (missing.size) {
  console.warn(
    `\n⚠️  В legal/operator.json не заполнены поля: ${[...missing].join(', ')}.\n` +
      '   В документах сейчас стоят пометки «[НЕ ЗАПОЛНЕНО: …]». Публиковать приложение с ними нельзя.',
  );
}
