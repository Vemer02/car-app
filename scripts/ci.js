#!/usr/bin/env node
/**
 * Помощник облачной сборки (.github/workflows/build-test-apk.yml). Без зависимостей.
 *
 *   node scripts/ci.js prepare <папка-скелета-RN> <папка-с-нашими-файлами>
 *       — сливает package.json со скелетом React Native и слегка донастраивает Gradle.
 *
 * Все ошибки — простыми словами: их читает человек, не разработчик.
 */
const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'com.carapp'; // applicationId, который создаёт `init CarApp`

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, text) => fs.writeFileSync(file, text);

/** Вставляет текст после строки-якоря. Идемпотентно: если маркер уже есть — ничего не делает. */
function insertAfter(file, anchor, addition, marker) {
  const text = read(file);
  if (text.includes(marker)) return false;
  const index = text.indexOf(anchor);
  if (index === -1) {
    fail(
      `Шаблон React Native изменился: в файле ${path.basename(file)} не нашлась строка «${anchor}». ` +
        'Пришлите этот текст ошибки — поправим скрипт сборки.',
    );
  }
  const end = index + anchor.length;
  write(file, text.slice(0, end) + addition + text.slice(end));
  return true;
}

function prepare(rnDir, ourDir) {
  // 1. package.json: берём скелет и добавляем наши библиотеки поверх (наши версии главнее).
  const templatePkg = JSON.parse(read(path.join(rnDir, 'package.json')));
  const ourPkg = JSON.parse(read(path.join(ourDir, 'package.json')));
  const merged = {
    ...templatePkg,
    scripts: { ...templatePkg.scripts, ...ourPkg.scripts },
    dependencies: { ...templatePkg.dependencies, ...ourPkg.dependencies },
    devDependencies: { ...templatePkg.devDependencies, ...ourPkg.devDependencies },
  };
  write(path.join(rnDir, 'package.json'), JSON.stringify(merged, null, 2) + '\n');
  console.log('package.json: слит со скелетом React Native');

  const appGradle = path.join(rnDir, 'android', 'app', 'build.gradle');
  const gradleProps = path.join(rnDir, 'android', 'gradle.properties');

  // 2. Не валить сборку из-за замечаний проверки кода (lint) — на тестовой сборке они не важны.
  insertAfter(
    appGradle,
    `namespace "${PACKAGE_NAME}"`,
    '\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }',
    'checkReleaseBuilds false',
  );

  // 3. Больше памяти для Gradle — на стандартных 2 ГБ сборка иногда падает.
  let props = read(gradleProps);
  if (!/^org\.gradle\.jvmargs=.*-Xmx3g/m.test(props)) {
    if (!/^org\.gradle\.jvmargs=/m.test(props)) {
      fail('Шаблон React Native изменился: в gradle.properties нет org.gradle.jvmargs.');
    }
    props = props.replace(/^org\.gradle\.jvmargs=.*$/m, 'org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=768m');
    write(gradleProps, props);
  }
  console.log('Gradle: настроен, память увеличена');
}

const [command, ...args] = process.argv.slice(2);
if (command === 'prepare' && args.length === 2) prepare(args[0], args[1]);
else fail('Использование: node scripts/ci.js prepare <rnDir> <ourDir>');
