#!/usr/bin/env node
// Сторож: в React Native (Hermes) нет или не полностью реализованы некоторые веб-API,
// которые в Node (где мы запускаем проверки) работают. Код с ними проходит все тесты и
// ломается только на телефоне — так было с URLSearchParams.set. Этот скрипт не даёт им
// попасть в исходники. Запускается в облачной сборке перед всем остальным.
const fs = require('fs');
const path = require('path');

const FORBIDDEN = [
  { re: /new\s+URLSearchParams\s*\(/, why: 'URLSearchParams: get/set/has/delete в React Native бросают "not implemented" — используйте utils/query.ts' },
  { re: /new\s+URL\s*\(/, why: 'URL: searchParams/hostname и др. в React Native не реализованы — разберите строку вручную' },
  { re: /\.searchParams\b/, why: 'URL.searchParams не реализован в React Native' },
  { re: /structuredClone\s*\(/, why: 'structuredClone нет в Hermes' },
  { re: /crypto\.randomUUID\s*\(/, why: 'crypto.randomUUID нет в React Native' },
  { re: /\.(toSorted|toReversed|toSpliced|findLast|findLastIndex)\s*\(/, why: 'Эти методы массивов могут отсутствовать в Hermes' },
];

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
}
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const root = process.argv[2] || path.join(__dirname, '..', 'src');
const problems = [];
for (const file of walk(root)) {
  const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const { re, why } of FORBIDDEN) if (re.test(line)) problems.push(`${path.relative(root, file)}:${i + 1}: ${why}`);
  });
}
if (problems.length) {
  console.error('Найдены вызовы, которых нет в React Native:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Проверка API React Native: запрещённых вызовов нет.');
