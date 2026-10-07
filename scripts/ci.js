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

const PACKAGE_NAME = 'com.carapp'; // namespace и пакет в коде Kotlin, который создаёт `init CarApp` — НЕ менять

// Название под иконкой на телефоне. RuStore требует, чтобы оно ТОЧНО совпадало с названием в магазине
// (а там оно должно быть уникальным и не длиннее 30 символов). Если название окажется занятым,
// задайте другое без правки файлов: GitHub → Settings → Secrets and variables → Actions → Variables → APP_NAME.
const DEFAULT_APP_NAME = 'CarApp';
const APP_NAME_MAX = 30;

// applicationId — «паспортное» имя приложения в магазине и на телефоне. Оно навсегда: после первой
// публикации сменить его нельзя (это будет уже другое приложение). Отделено от PACKAGE_NAME
// намеренно — менять applicationId безопасно, не трогая код. Задаётся без правки файлов:
// GitHub → Settings → Secrets and variables → Actions → вкладка Variables → APPLICATION_ID.
const DEFAULT_APPLICATION_ID = 'ru.mygarazhapp.car';
const APPLICATION_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

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

/** Заменяет ровно одно совпадение регулярного выражения; если не нашлось — понятная ошибка. */
function replaceOnce(file, regex, replacement, what) {
  const text = read(file);
  if (!regex.test(text)) {
    fail(
      `Шаблон React Native изменился: в ${path.basename(file)} не нашлось «${what}». ` +
        'Пришлите этот текст ошибки — поправим скрипт сборки.',
    );
  }
  write(file, text.replace(regex, replacement));
}

/**
 * Настоящая проверка ключа: пробуем открыть хранилище и достать из него ключ тем же keytool, что
 * лежит на сборочной машине. Ловит обрезанный при копировании ключ, неверный пароль хранилища,
 * неверный пароль ключа и неверный псевдоним — иначе всё это вылезло бы через 15 минут сборки
 * малопонятной ошибкой Gradle. Пароли передаём через переменные окружения (`:env`), а не в аргументах.
 */
function verifyKeystore(keystoreFile) {
  const { spawnSync } = require('child_process');
  const os = require('os');
  const tmpDest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ks-check-')), 'check.p12');
  const result = spawnSync(
    'keytool',
    [
      '-importkeystore',
      '-srckeystore', keystoreFile,
      '-srcstorepass:env', 'ANDROID_KEYSTORE_PASSWORD',
      '-srcalias', process.env.ANDROID_KEY_ALIAS,
      '-srckeypass:env', 'ANDROID_KEY_PASSWORD',
      '-destkeystore', tmpDest,
      '-deststoretype', 'PKCS12',
      '-deststorepass:env', 'ANDROID_KEYSTORE_PASSWORD',
      '-noprompt',
    ],
    { env: process.env, encoding: 'utf8' },
  );
  fs.rmSync(path.dirname(tmpDest), { recursive: true, force: true });

  if (result.error && result.error.code === 'ENOENT') {
    console.warn('⚠ Не нашёл keytool — ключ не проверен заранее (на сборочной машине он должен быть).');
    return;
  }
  if (result.status !== 0) {
    const detail = ((result.stderr || '') + (result.stdout || '')).trim().split('\n').slice(-2).join(' ').slice(0, 220);
    fail(
      'Ключ подписи не открылся. Частые причины: ключ в секрете обрезан при копировании, неверный пароль ' +
        '(ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD) или неверный псевдоним (ANDROID_KEY_ALIAS). ' +
        `Ответ keytool: «${detail}». См. ПУБЛИКАЦИЯ.md, шаг 1.`,
    );
  }
}

/** Подпись настоящим ключом (из секретов GitHub). Нет ключа — остаётся отладочная, и об этом громко сказано. */
function configureSigning(rnDir, appGradle) {
  const names = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
  const present = names.filter((n) => (process.env[n] || '').trim() !== '');

  if (present.length === 0) {
    console.warn(
      '\n⚠ ПОДПИСЬ ТЕСТОВАЯ (общий отладочный ключ). Для проверки на своём телефоне это нормально,\n' +
        '  но RuStore такую сборку ОТКЛОНИТ (правило 2.14: подпись отладочным сертификатом).\n' +
        '  Чтобы подписывать настоящим ключом, заведите четыре секрета — см. ПУБЛИКАЦИЯ.md, шаг 1.\n',
    );
    console.log('::warning title=Подпись тестовая::Сборка подписана отладочным ключом — RuStore её отклонит. См. ПУБЛИКАЦИЯ.md, шаг 1.');
    return false;
  }
  if (present.length !== names.length) {
    const missing = names.filter((n) => !present.includes(n));
    fail(
      `Секреты подписи заведены не полностью — не хватает: ${missing.join(', ')}. ` +
        'Нужны все четыре (или ни одного). См. ПУБЛИКАЦИЯ.md, шаг 1.',
    );
  }

  const keystore = Buffer.from(process.env.ANDROID_KEYSTORE_BASE64.replace(/\s+/g, ''), 'base64');
  // Файл-хранилище начинается с известной сигнатуры: PKCS12 — байт 0x30, JKS — FEEDFEED.
  const looksLikeKeystore = keystore.length > 100 && (keystore[0] === 0x30 || keystore.readUInt32BE(0) === 0xfeedfeed);
  if (!looksLikeKeystore) {
    fail(
      'Секрет ANDROID_KEYSTORE_BASE64 не похож на файл ключа (повреждён, обрезан или это не base64). ' +
        'Скопируйте вывод команды base64 целиком, без лишних пробелов и переносов. См. ПУБЛИКАЦИЯ.md, шаг 1.',
    );
  }
  write(path.join(rnDir, 'android', 'app', 'release.keystore'), keystore);
  verifyKeystore(path.join(rnDir, 'android', 'app', 'release.keystore'));

  // Пароли в файлы НЕ пишем — Gradle прочитает их из переменных окружения во время сборки.
  insertAfter(
    appGradle,
    "keyPassword 'android'\n        }",
    "\n        release {\n" +
      "            storeFile file('release.keystore')\n" +
      "            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')\n" +
      "            keyAlias System.getenv('ANDROID_KEY_ALIAS')\n" +
      "            keyPassword System.getenv('ANDROID_KEY_PASSWORD')\n" +
      '        }',
    "storeFile file('release.keystore')",
  );
  replaceOnce(
    appGradle,
    /signingConfig signingConfigs\.(debug|release)(\s+minifyEnabled)/,
    'signingConfig signingConfigs.release$2',
    'signingConfig в блоке release',
  );
  console.log('Подпись: настоящим ключом из секретов GitHub (release.keystore); пароли — только из переменных окружения.');
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

  // 2б. Идентичность приложения: название под иконкой, applicationId, номер версии, подпись.
  const applicationId = (process.env.APPLICATION_ID || '').trim() || DEFAULT_APPLICATION_ID;
  if (!APPLICATION_ID_RE.test(applicationId)) {
    fail(
      `APPLICATION_ID «${applicationId}» недопустим: только маленькие латинские буквы, цифры и _, ` +
        'части через точку, каждая начинается с буквы (например ru.mygarazhapp.car).',
    );
  }
  replaceOnce(appGradle, /applicationId\s+"[^"]*"/, `applicationId "${applicationId}"`, 'applicationId');

  const versionCode = parseInt(process.env.VERSION_CODE || '1', 10);
  if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) {
    fail(`VERSION_CODE «${process.env.VERSION_CODE}» недопустим: нужно целое число от 1.`);
  }
  const versionName = (process.env.VERSION_NAME || '1.0.0').trim();
  if (!/^[0-9A-Za-z.\-_+]+$/.test(versionName)) {
    fail(`VERSION_NAME «${versionName}» недопустим: только латинские буквы, цифры и . - _ +`);
  }
  replaceOnce(appGradle, /versionCode\s+\d+/, `versionCode ${versionCode}`, 'versionCode');
  replaceOnce(appGradle, /versionName\s+"[^"]*"/, `versionName "${versionName}"`, 'versionName');

  const appName = (process.env.APP_NAME || '').trim() || DEFAULT_APP_NAME;
  if (appName.length > APP_NAME_MAX) {
    fail(`APP_NAME «${appName}» длиннее ${APP_NAME_MAX} символов — RuStore такое название не примет.`);
  }
  // Для XML и для строковых ресурсов Android: &, <, > и кавычки нужно экранировать.
  const escaped = appName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(['"])/g, '\\$1')
    .replace(/^([@?])/, '\\$1');
  replaceOnce(
    path.join(rnDir, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
    /(<string name="app_name">)[^<]*(<\/string>)/,
    (_m, open, close) => `${open}${escaped}${close}`,
    'app_name',
  );
  console.log(`Приложение: «${appName}», applicationId ${applicationId}, версия ${versionName} (код ${versionCode}).`);
  if (applicationId === PACKAGE_NAME) {
    console.warn(
      '⚠ applicationId com.carapp — шаблонное, слишком общее имя: в RuStore имя пакета должно быть уникальным, ' +
        'а после первой публикации его не сменить. Задайте своё (по умолчанию стоит ru.mygarazhapp.car).',
    );
  }
  // Название и в текстах приложения (сообщение-приглашение и т.п.) берём то же, что под иконкой.
  write(
    path.join(rnDir, 'src', 'appInfo.ts'),
    `// Создано scripts/ci.js при сборке — то же название, что под иконкой на телефоне.\n` +
      `export const APP_NAME = ${JSON.stringify(appName)};\n`,
  );
  configureSigning(rnDir, appGradle);

  // 3. Своя иконка приложения поверх стандартной иконки React Native. Копируем файл
  // за файлом (не целую папку разом) — так получившийся res/ сохраняет то, что уже
  // положил туда шаблон (строки, стили и т.д.), а не просто заменяется целиком.
  const iconSrcRoot = path.join(ourDir, 'assets', 'android-icon');
  const resDir = path.join(rnDir, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(iconSrcRoot)) {
    let copied = 0;
    for (const sub of fs.readdirSync(iconSrcRoot)) {
      const srcSub = path.join(iconSrcRoot, sub);
      const destSub = path.join(resDir, sub);
      fs.mkdirSync(destSub, { recursive: true });
      for (const file of fs.readdirSync(srcSub)) {
        fs.copyFileSync(path.join(srcSub, file), path.join(destSub, file));
        copied++;
      }
    }
    console.log(`Иконка приложения: скопировано файлов — ${copied}`);
  }

  // 4. Push-уведомления RuStore — нужен отдельный Maven-репозиторий (их пакетов нет на
  // обычных mavenCentral/google) и несколько meta-data в манифесте. Это единственная
  // часть всей сборки, собранная по документации, а не проверенная вживую, — пакет
  // ставится из гита (gitflic.ru), а этот адрес недоступен из моей среды. Если здесь
  // будет ошибка сборки — пришлите её текст, поправим именно этот кусок.
  // Репозиторий нужен ВСЕМ модулям, не только приложению: сама библиотека
  // react-native-rustore-push — отдельный Gradle-модуль со своими зависимостями
  // (ru.rustore.sdk:pushclient), и в её собственном build.gradle адреса RuStore нет.
  // Поэтому allprojects в корневом файле, а не repositories в app/build.gradle (так
  // первая сборка и падала: "Could not find ru.rustore.sdk:pushclient").
  insertAfter(
    path.join(rnDir, 'android', 'build.gradle'),
    'apply plugin: "com.facebook.react.rootproject"',
    '\n\nallprojects {\n' +
      '    repositories {\n' +
      '        maven { url "https://nexus-external.vkteam.ru/repository/maven/" }\n' +
      '        maven { url "https://artifactory-external.vkpartner.ru/artifactory/maven" } // старый адрес, на случай переезда\n' +
      '    }\n' +
      '}',
    'nexus-external.vkteam.ru',
  );

  const configTs = read(path.join(ourDir, 'src', 'config.ts'));
  const projectIdMatch = configTs.match(/RUSTORE_PUSH_PROJECT_ID\s*=\s*'([^']*)'/);
  const pushProjectId = projectIdMatch ? projectIdMatch[1] : null;
  if (!pushProjectId || pushProjectId.startsWith('REPLACE_ME')) {
    console.log('RuStore push: RUSTORE_PUSH_PROJECT_ID не заполнен в src/config.ts — пропускаю настройку манифеста.');
  } else {
    const manifestPath = path.join(rnDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    insertAfter(
      manifestPath,
      '<uses-permission android:name="android.permission.INTERNET" />',
      '\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
      'POST_NOTIFICATIONS',
    );
    insertAfter(
      manifestPath,
      'android:supportsRtl="true">',
      '\n      <meta-data android:name="ru.rustore.sdk.pushclient.project_id" android:value="' +
        pushProjectId +
        '" />\n' +
        '      <meta-data android:name="ru.rustore.sdk.pushclient.default_notification_channel_id" android:value="reminders" />\n' +
        '      <meta-data android:name="ru.rustore.sdk.pushclient.default_notification_icon" android:resource="@mipmap/ic_launcher" />\n' +
        '      <meta-data android:name="ru.rustore.sdk.pushclient.default_notification_color" android:resource="@color/ic_launcher_background" />',
      'ru.rustore.sdk.pushclient.project_id',
    );
    console.log('RuStore push: манифест настроен (project_id ' + pushProjectId + ')');
  }

  // 5. Своя ссылка-схема carapp:// — чтобы ссылка на передачу машины (из QR-кода)
  // открывала само приложение, если оно уже установлено. Не полноценные Android App
  // Links (там нужна ещё проверка владения доменом через файл на сервере) — простая
  // схема, которую Android предложит открыть каждому, у кого стоит приложение.
  insertAfter(
    path.join(rnDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    '<category android:name="android.intent.category.LAUNCHER" />\n        </intent-filter>',
    '\n        <intent-filter>\n' +
      '            <action android:name="android.intent.action.VIEW" />\n' +
      '            <category android:name="android.intent.category.DEFAULT" />\n' +
      '            <category android:name="android.intent.category.BROWSABLE" />\n' +
      '            <data android:scheme="carapp" />\n' +
      '        </intent-filter>',
    'android:scheme="carapp"',
  );

  // 5б. Реклама (Яндекс). Автозапуск рекламного SDK при старте приложения ОТКЛЮЧАЕМ: по
  // умолчанию он стартует сам и раньше, чем человек вошёл и принял согласие. Мы запускаем его
  // вручную, только когда нужно показать рекламу при запуске (services/launchAd.ts).
  insertAfter(
    path.join(rnDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    'android:supportsRtl="true">',
    '\n      <meta-data android:name="com.yandex.mobile.ads.AUTOMATIC_SDK_INITIALIZATION" android:value="false" />',
    'com.yandex.mobile.ads.AUTOMATIC_SDK_INITIALIZATION',
  );
  const adsConfig = read(path.join(ourDir, 'src', 'adsConfig.ts'));
  const unitId = (adsConfig.match(/YANDEX_APP_OPEN_UNIT_ID\s*=\s*'([^']*)'/) || [])[1] || '';
  if (/^demo-/.test(unitId) || unitId === '') {
    console.warn(
      '\n⚠ Реклама: в src/adsConfig.ts стоит ТЕСТОВЫЙ блок Яндекса (' + unitId + ') — он показывает пробные\n' +
        '  объявления и денег не приносит. Для проверки на своём телефоне это нормально, а для публикации\n' +
        '  впишите настоящий идентификатор блока (см. README, раздел «Реклама»).\n',
    );
  }

  // 6. Фон окна Android — самая нижняя подложка под всем приложением. По шаблону светлая,
  // и при анимации свайпа (экран на миг полупрозрачный) сквозь него белой вспышкой
  // проступает именно она. Цвет берём из тех же токенов, что и тёмная тема приложения.
  const tokens = read(path.join(ourDir, 'src', 'theme', 'tokens.ts'));
  const bgMatch = tokens.match(/darkTheme\s*=\s*\{[\s\S]*?background:\s*'(#[0-9A-Fa-f]{6})'/);
  const darkBackground = bgMatch ? bgMatch[1] : '#0D0F12';
  insertAfter(
    path.join(rnDir, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml'),
    '<item name="android:editTextBackground">@drawable/rn_edit_text_material</item>',
    '\n        <item name="android:windowBackground">' + darkBackground + '</item>',
    'android:windowBackground',
  );

  // 7. Больше памяти для Gradle — на стандартных 2 ГБ сборка иногда падает.
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
