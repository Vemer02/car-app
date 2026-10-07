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
