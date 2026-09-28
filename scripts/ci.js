#!/usr/bin/env node
/**
 * Помощник облачной сборки (.github/workflows/build-test-apk.yml). Без зависимостей.
 *
 *   node scripts/ci.js prepare <папка-скелета-RN> <папка-с-нашими-файлами>
 *       — сливает package.json и подключает Firebase к Gradle-файлам скелета;
 *   node scripts/ci.js google-services <папка-скелета-RN>
 *       — кладёт google-services.json из секрета GitHub и проверяет, что он от того же приложения.
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

  const rootGradle = path.join(rnDir, 'android', 'build.gradle');
  const appGradle = path.join(rnDir, 'android', 'app', 'build.gradle');
  const gradleProps = path.join(rnDir, 'android', 'gradle.properties');

  // 2. Плагины Firebase для Gradle — без них приложение падает при запуске
  //    («No Firebase App '[DEFAULT]' has been created»).
  insertAfter(
    rootGradle,
    'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")',
    '\n        classpath("com.google.gms:google-services:4.4.2")' +
      '\n        classpath("com.google.firebase:firebase-crashlytics-gradle:3.0.2")',
    'com.google.gms:google-services',
  );
  insertAfter(
    appGradle,
    'apply plugin: "com.facebook.react"',
    '\napply plugin: "com.google.gms.google-services"' + '\napply plugin: "com.google.firebase.crashlytics"',
    'com.google.gms.google-services',
  );

  // 3. Не валить сборку из-за замечаний проверки кода (lint) — на тестовой сборке они не важны.
  insertAfter(
    appGradle,
    `namespace "${PACKAGE_NAME}"`,
    '\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }',
    'checkReleaseBuilds false',
  );

  // 4. Больше памяти для Gradle: на стандартных 2 ГБ сборка с Firebase иногда падает.
  let props = read(gradleProps);
  if (!/^org\.gradle\.jvmargs=.*-Xmx3g/m.test(props)) {
    if (!/^org\.gradle\.jvmargs=/m.test(props)) {
      fail('Шаблон React Native изменился: в gradle.properties нет org.gradle.jvmargs.');
    }
    props = props.replace(/^org\.gradle\.jvmargs=.*$/m, 'org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=768m');
    write(gradleProps, props);
  }
  console.log('Gradle: Firebase подключён, память увеличена');
}

function googleServices(rnDir) {
  const raw = process.env.GOOGLE_SERVICES_JSON;
  if (!raw || !raw.trim()) {
    fail(
      'Не найден секрет GOOGLE_SERVICES_JSON. Откройте в репозитории: Settings → Secrets and variables → ' +
        'Actions → New repository secret, имя GOOGLE_SERVICES_JSON, значение — весь текст файла google-services.json.',
    );
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    fail(
      'Секрет GOOGLE_SERVICES_JSON вставлен не полностью или с ошибкой (это не читается как JSON). ' +
        'Откройте google-services.json, выделите ВЕСЬ текст (от первой { до последней }) и вставьте заново.',
    );
  }

  const packages = (json.client || []).map((c) => c?.client_info?.android_client_info?.package_name).filter(Boolean);
  if (!packages.includes(PACKAGE_NAME)) {
    fail(
      `В google-services.json указано приложение «${packages.join(', ') || 'не найдено'}», а нужно «${PACKAGE_NAME}». ` +
        `В Firebase добавьте Android-приложение с именем пакета ${PACKAGE_NAME}, скачайте новый файл и обновите секрет.`,
    );
  }

  fs.mkdirSync(path.join(rnDir, 'android', 'app'), { recursive: true });
  write(path.join(rnDir, 'android', 'app', 'google-services.json'), JSON.stringify(json, null, 2));
  console.log(`google-services.json принят (проект Firebase: ${json.project_info?.project_id}, приложение: ${PACKAGE_NAME})`);
}

const [command, ...args] = process.argv.slice(2);
if (command === 'prepare' && args.length === 2) prepare(args[0], args[1]);
else if (command === 'google-services' && args.length === 1) googleServices(args[0]);
else fail('Использование: node scripts/ci.js prepare <rnDir> <ourDir> | google-services <rnDir>');
