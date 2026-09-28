# Автолюбитель — Android-приложение

React Native + TypeScript + Firebase + WatermelonDB (offline-first).

## 1. Создать проект

Эти файлы — не полный RN-проект: нативные папки `android/`/`ios` генерирует CLI.
**Версию React Native нужно зафиксировать** — иначе CLI создаст нативную часть под самую
свежую версию RN, а `package.json` из архива рассчитан на 0.75.4, и сборка не сойдётся.

```bash
npx @react-native-community/cli@latest init CarApp --version 0.75.4
cd CarApp
```

(Старая команда `npx react-native init` в новых версиях удалена, а TypeScript теперь
включён в шаблон по умолчанию — отдельный шаблон не нужен.)

Затем скопируйте из архива поверх созданного проекта: папки `src/`, `legal/`, `scripts/`,
`functions/`, `.github/`, файлы `App.tsx`, `package.json`, `tsconfig.json`, `babel.config.js`,
`firebase.json`, `.firebaserc.example`, `.env.example`, `.gitignore`. Папки `legal/` и
`scripts/` обязательны: `npm install` запускает `scripts/build-legal.js` (генерирует
`src/legal/generated.ts`, без которого приложение не соберётся). `firebase.json` должен
лежать в корне проекта — из него при сборке читаются и настройки Firebase CLI, и
настройки React Native Firebase (отключённый до согласия сбор Crashlytics и FCM).

## 2. Зависимости

```bash
npm install
```

Все зависимости уже перечислены в `package.json`. **Закоммитьте появившийся
`package-lock.json`** — сборка в GitHub Actions (`npm ci`) без него не запустится.

Добавьте в `.gitignore`: `android/app/google-services.json`, `.env`, `.firebaserc` —
в них ключи и идентификаторы вашего проекта.

## 3. Firebase

1. Создайте проект в [Firebase Console](https://console.firebase.google.com).
2. Добавьте Android-приложение (package name — как в `android/app/build.gradle`,
   `applicationId`), скачайте `google-services.json` → положите в `android/app/`.
3. **Подключите Gradle-плагины Firebase** — без этого шага приложение падает при запуске
   с ошибкой «No Firebase App '[DEFAULT]' has been created»:
   - `android/build.gradle`, блок `buildscript { dependencies { ... } }`:
     ```gradle
     classpath("com.google.gms:google-services:4.4.2")
     classpath("com.google.firebase:firebase-crashlytics-gradle:3.0.2")
     ```
   - `android/app/build.gradle`, сразу после строки `apply plugin: "com.android.application"`:
     ```gradle
     apply plugin: "com.google.gms.google-services"
     apply plugin: "com.google.firebase.crashlytics"
     ```
4. Включите в консоли: **Authentication** (Email/Password), **Firestore**,
   **Cloud Messaging**, **Crashlytics**.
5. Разверните правила: `firebase deploy --only firestore:rules` (или вставьте
   `src/services/firestore.rules` в Firestore → Rules вручную).
6. **Составной индекс** для синхронизации: при первом запуске Firestore напишет в лог
   ошибку со ссылкой «create index» — по одной на каждую из коллекций `cars`,
   `service_records`, `expenses`, `reminders` (поля `garageId` + `updatedAt`). Перейдите
   по ссылкам — индексы создадутся за пару минут.

### Google Sign-In

1. Firebase Console → Authentication → Sign-in method → включите **Google**.
2. На той же странице разверните «Web SDK configuration» — скопируйте **Web client ID**
   (это НЕ Android-клиент) и вставьте в `src/config.ts` (`GOOGLE_WEB_CLIENT_ID`).
3. Добавьте отпечаток SHA-1 (а лучше и SHA-256) отладочной сборки в Firebase Console →
   Project settings → ваше Android-приложение → Add fingerprint:
   ```bash
   cd android && ./gradlew signingReport
   # берите SHA1/SHA256 из блока Variant: debug
   ```
   Без этого шага вход через Google будет падать с `DEVELOPER_ERROR` — это самая частая
   причина проблем с Google Sign-In на Android, не про код, а именно про этот отпечаток.
4. Скачайте обновлённый `google-services.json` после добавления отпечатка и переложите
   в `android/app/`.

### Вход через Telegram-бота

Бесплатная альтернатива SMS: пользователь подтверждает вход в чате с вашим ботом, а не
кодом из смс. Нужен небольшой бэкенд (`functions/`) — выдачу Firebase custom token нельзя
делать прямо из приложения, это должно происходить на сервере с Admin SDK.

1. **Перейдите на тариф Blaze** (Firebase Console → Usage and billing) — Cloud Functions
   на бесплатном Spark не может делать исходящие запросы к api.telegram.org. В пределах
   бесплатного лимита самих функций (2 млн вызовов/мес) это по факту ничего не будет стоить.
2. **Создайте бота**: в Telegram напишите [@BotFather](https://t.me/BotFather) → `/newbot`,
   задайте имя. Получите токен бота и **имя бота без @** — впишите его в
   `src/config.ts` (`TELEGRAM_BOT_USERNAME`).
3. **Установите Firebase CLI и войдите**, если ещё не делали:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
4. Скопируйте `.firebaserc.example` → `.firebaserc`, впишите свой project id.
5. **Задайте секреты для Cloud Functions**:
   ```bash
   cd functions && npm install
   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
   # вставьте токен от BotFather

   firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
   # придумайте и вставьте любую случайную строку (просто пароль для вебхука)
   ```
6. **Разверните функции**:
   ```bash
   firebase deploy --only functions
   ```
   В выводе будет URL вида `https://<region>-<project>.cloudfunctions.net/telegramWebhook` —
   он понадобится на следующем шаге.
7. **Зарегистрируйте вебхук** у Telegram (замените `<BOT_TOKEN>`, `<WEBHOOK_URL>`,
   `<WEBHOOK_SECRET>` — последний должен совпадать с тем, что задали в шаге 5):
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<WEBHOOK_URL>&secret_token=<WEBHOOK_SECRET>&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D"
   ```
   (`allowed_updates` включает нажатия кнопок — без них кнопка «Подтвердить вход» в боте
   не будет работать.)
8. **Выдайте функции право подписывать токены входа.** Самая частая ошибка на этом этапе:
   без него вход падает с `Permission 'iam.serviceAccounts.signBlob' denied`.
   Google Cloud Console → IAM → найдите сервисный аккаунт
   `<номер-проекта>-compute@developer.gserviceaccount.com` → «Изменить» → добавьте роль
   **Service Account Token Creator**.
9. Разверните и обновлённые `src/services/firestore.rules` (в них коллекция
   `telegram_login_requests`):
   ```bash
   firebase deploy --only firestore:rules
   ```
10. **Обязательно:** Firestore → TTL policies → добавьте политику для коллекции
    `telegram_login_requests` по полю `expiresAt`. Политика конфиденциальности обещает, что
    неиспользованные служебные записи входа (в них лежат Telegram-ID и имя) стираются
    автоматически в течение суток — без этой настройки они копились бы бессрочно.
    (Использованные заявки функция очищает от персональных данных сама, сразу при входе.)

Как это выглядит для пользователя: «Войти через Telegram» → открывается бот → «Start» →
бот спрашивает «Подтвердить вход?» с кнопками → «✅ Подтвердить» → приложение само
завершает вход. Кнопка подтверждения — защита от мошенников: ссылку на вход могут прислать
со словами «нажми Start», и одного нажатия Start для входа в аккаунт недостаточно.

Проверить: откройте бота в Telegram и отправьте `/start test123` — должны получить
сообщение «ссылка уже не действует» (это нормально — значит вебхук работает, просто
такой заявки на вход не существует).

## 3.5. Политика конфиденциальности и согласие на обработку данных

Тексты — в `legal/privacy-policy.md` и `legal/consent.md` (это **два отдельных документа**:
с 1 сентября 2025 года ст. 9 152-ФЗ прямо запрещает объединять согласие на обработку
персональных данных с политикой, пользовательским соглашением или чем-либо ещё). Из них
`node scripts/build-legal.js` (запускается автоматически при `npm install`) собирает:

- `src/legal/generated.ts` — тексты для экранов внутри приложения, доступны без интернета;
- `public/privacy.html`, `public/consent.html`, `public/delete-account.html` — публичные
  веб-страницы. Google Play требует ссылку на политику конфиденциальности и, для приложений
  с регистрацией, ссылку на страницу удаления аккаунта.

**Перед первым запуском:**

1. Откройте `legal/operator.json` и заполните все поля (название/ИП, ИНН, адрес, email,
   `dataLocation` — страна(ы), где физически расположены серверы Firebase для вашего
   проекта; уточняется в Firebase Console → Project settings → его можно посмотреть по
   выбранному при создании проекта региону Firestore). Пока поля не заполнены, в текстах
   стоят метки `[НЕ ЗАПОЛНЕНО: …]` — с ними публиковать приложение нельзя, но для
   локальной разработки это не блокирует сборку.
2. `npm run legal` — пересобрать после любой правки.
3. Разверните публичные страницы: `firebase deploy --only hosting`. После этого политика
   будет доступна по `https://<project-id>.web.app/privacy` — этот адрес (без `/privacy`)
   укажите в `legal/operator.json` (`siteUrl`), пересоберите (`npm run legal`) и разверните
   хостинг ещё раз.
4. **Play Console** (App content):
   - *Privacy policy* → `<siteUrl>/privacy`;
   - *Data safety* → *Account deletion* → ссылка `<siteUrl>/delete-account` (в самом
     приложении удаление — «Гараж» → «Удалить аккаунт и все данные»);
   - в *Data safety* отметьте собираемые данные: email, имя, идентификаторы пользователя
     (Telegram/Google ID), сведения об автомобилях и расходах, диагностика сбоев.

**Как это устроено в приложении:**

- Экран регистрации email/паролем — отдельная галочка (`ConsentCheckbox`), по умолчанию
  не отмечена. Без неё кнопка «Зарегистрироваться» подсвечивает ошибку и не пускает дальше.
- Вход через Google/Telegram на экране регистрации — та же галочка; согласие
  фиксируется тем же способом, что и для email.
- Вход через Google/Telegram **с экрана логина** — если это оказался новый пользователь,
  после входа показывается отдельный `ConsentScreen`: приложением нельзя пользоваться,
  пока согласие не дано явным действием на этом экране.
- Согласие журналируется в `users/{uid}/consents` (только дописывается, не редактируется и
  не удаляется — это ваше доказательство факта согласия на случай проверки).
- **До согласия ничего не уходит в облако.** Синхронизация с Firestore включается в
  `App.tsx` только при `consentState === 'accepted'`. Сбор отчётов Crashlytics выключен
  в `firebase.json` (`react-native.crashlytics_auto_collection_enabled: false`) и включается
  кодом после согласия. Автоинициализация push (FCM) выключена там же
  (`messaging_auto_init_enabled: false`), пока push-напоминания не реализованы. Эти ключи
  читаются при сборке Android-приложения — после их изменения нужна пересборка.
- **Удаление аккаунта** (Cloud Function `deleteMyAccount`, логика и тесты —
  `functions/accountDeletion.js`, `npm test` в `functions/`). Удаляет профиль, журнал
  согласий, свой гараж со всеми данными, заявки и приглашения, затем сам аккаунт входа.
  Из чужого гаража просто исключает. Участников своего гаража возвращает в их собственные
  гаражи — общие данные они теряют.
- При существенной правке текстов увеличьте `version` в `legal/operator.json` — все
  пользователи, у кого согласие дано на более раннюю редакцию, снова увидят `ConsentScreen`.

## 4. Запуск

```bash
npx react-native run-android
```

## Структура

```
App.tsx               — корень: вход/выход, согласие на обработку ПД, замок по биометрии,
                         безопасный сброс базы
functions/            — Cloud Functions: вход через Telegram-бота, удаление аккаунта
                         (accountDeletion.js + test/)
legal/                — исходники политики конфиденциальности и согласия (см. раздел 3.5)
scripts/build-legal.js — собирает legal/*.md в src/legal/generated.ts и public/*.html
scripts/ci.js         — помощник облачной сборки APK (см. ТЕСТ-НА-ТЕЛЕФОНЕ.md)
ТЕСТ-НА-ТЕЛЕФОНЕ.md   — пошаговая инструкция: собрать APK в облаке и поставить на телефон
src/
  config.ts           — ключи провайдеров входа (Google Web client ID, имя бота)
  types/              — TypeScript-типы предметной области
  utils/date.ts       — строгий разбор/формат дат ДД.ММ.ГГГГ
  legal/generated.ts  — автосгенерировано, не редактировать (см. scripts/build-legal.js)
  services/
    firebase.ts       — Firebase, профиль и гараж пользователя, активный гараж, согласие на ПД
    session.ts        — выход из аккаунта с очисткой локальных данных
    account.ts        — удаление аккаунта (вызов Cloud Function + локальная очистка)
    localData.ts      — безопасный сброс локальной базы (размонтировать → сбросить → смонтировать)
    garages.ts        — приглашения, заявки, участники, выход из гаража
    googleAuth.ts     — вход через Google
    telegramAuth.ts   — вход через Telegram-бота (клиент)
    biometrics.ts     — замок по отпечатку/Face ID
    obd2.ts           — Bluetooth/ELM327 (заготовка, следующий этап)
    firestore.rules   — правила доступа
  db/
    schema.ts, models/ — схема и модели WatermelonDB
    queries.ts        — реактивные выборки
    sync.ts           — синхронизация с Firestore
  context/, hooks/    — активное авто, данные Dashboard, активный гараж, вход через Telegram
  navigation/         — AuthStack + MainTabs + модальные экраны
  screens/            — экраны (Obd2ConnectScreen — пока заготовка; ConsentScreen — экран согласия)
  components/         — кнопки, поля, иконки, экран блокировки, окно ожидания Telegram,
                         галочка и просмотр документов согласия
  theme/tokens.ts     — цвета/типографика из дизайн-системы
```

## Как получить APK для тестировщиков

**Самый простой путь — облачная сборка без компьютера с Android Studio:** подробная
пошаговая инструкция «для чайников» — в файле `ТЕСТ-НА-ТЕЛЕФОНЕ.md`. Workflow
`.github/workflows/build-test-apk.yml` сам создаёт пустой проект React Native нужной версии,
кладёт в него файлы из репозитория, подключает Firebase к Gradle (`scripts/ci.js`), собирает
APK и выкладывает его в Releases. Нужен только секрет `GOOGLE_SERVICES_JSON` (полный текст
файла `google-services.json`). Репозиторий — обычный (не «слитый» с `android/`): нативные
папки в нём хранить не нужно.

Почему собирается именно **release**, а не debug: debug-APK не содержит код приложения и на
любом телефоне без компьютера с Metro покажет красный экран «Unable to load script».
Release здесь подписан стандартным отладочным ключом React Native (отпечаток SHA-1
`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` — один и тот же во всех сборках,
его достаточно один раз добавить в Firebase для входа через Google), поэтому ставится на
любой телефон. Для публикации в Google Play нужен свой ключ подписи — это отдельный этап.

**Локальная сборка** (если поставлены Android SDK и JDK 17, проект создан по разделу 1):

```bash
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

## Реализовано

- Auth: экраны логина/регистрации (Firebase Auth), сброс пароля, вход через Google
  (`src/services/googleAuth.ts`), **вход через Telegram-бота** (`src/services/telegramAuth.ts`
  + `functions/` — требует настройки, см. раздел выше).
- **Политика конфиденциальности и согласие на обработку ПД** (см. раздел 3.5) — отдельные
  документы согласно 152-ФЗ, галочка на регистрации, экран согласия для входа через
  Google/Telegram, журнал согласий, публичные страницы для Google Play, удаление аккаунта
  из приложения и по публичной ссылке.
- Dashboard: пробег, ручное обновление, ближайшее ТО с прогресс-баром, напоминания, расходы за месяц.
- Гараж: список авто, добавление авто, переключение активного авто, базовые настройки.
- Обслуживание: список записей ТО по месяцам, добавление записи (авто-апдейт напоминания и пробега).
- Расходы: список за месяц, разбивка по категориям, добавление расхода (с учётом топлива).
- Удаление: долгое нажатие на авто/запись ТО/расход — с подтверждением; удаление авто каскадно
  удаляет его записи ТО, расходы и напоминания.
- **Синхронизация с Firestore** (`src/db/sync.ts`): офлайн-первая, last-write-wins; время
  изменений — серверное (`serverTimestamp`), поэтому расхождение часов между телефонами
  не приводит к потере изменений. Локальная база «привязана» к гаражу: при вступлении в общий
  гараж, выходе из него (в т.ч. на другом своём устройстве) или входе другого аккаунта
  синхронизация сама дошлёт несинхронизированное и безопасно перезальёт базу.
  Работает в фоне (раз в 60 сек, пока пользователь авторизован — см. `App.tsx`), плюс сразу
  после любого локального изменения и по pull-to-refresh на Dashboard/Service/Expenses.

- **Биометрия** (`src/services/biometrics.ts`): замок поверх уже открытой Firebase-сессии
  через `react-native-keychain` — при возврате в приложение из фона просит отпечаток/Face ID,
  прежде чем показать данные. Включается тумблером в Гараже, реализовано в `App.tsx` (`AppState`).

- **Совместные гаражи** (`src/services/garages.ts`): полноценная модель на несколько
  участников — код приглашения (6 символов, живёт 7 дней), заявка на вступление,
  одобрение любым текущим участником, автоматическое переключение `activeGarageId`
  у вступившего. UI — секция «Участники гаража» на экране Гаража.

Все экраны работают полностью офлайн на WatermelonDB — изменения копятся локально и
досинхронизируются, как только появится сеть.

### Как работают совместные гаражи

1. У каждого пользователя при регистрации сразу создаётся свой гараж (`garages/{uid}`,
   `members: [uid]`).
2. Кнопка «Пригласить» создаёт код (`garage_invites/{code}`, TTL 7 дней) — делится через
   системный Share.
3. Тот, кому дали код, жмёт «У меня есть код» → создаётся `garage_join_requests` со
   статусом `pending`.
4. Любой текущий участник гаража видит заявку в реальном времени и жмёт «Принять» —
   это добавляет его `uid` в `garages/{id}.members` и его email в `memberEmails`.
5. Вступивший, открыв Гараж в следующий раз (или сразу, если был онлайн), видит, что его
   заявка одобрена: у него `users/{uid}.activeGarageId` переключается на общий гараж,
   **локальная база WatermelonDB сбрасывается и синхронизируется заново** — это
   осознанное решение: один и тот же локальный кэш не должен одновременно содержать
   данные двух разных гаражей вперемешку.

**Выход обратно в свой гараж**: кнопка «Покинуть общий гараж» в разделе «Участники» —
убирает вас из `members`/`memberEmails` общего гаража, возвращает `activeGarageId` на
собственный, и точно так же сбрасывает и пересинхронизирует локальную базу.

### Важно перед первым запуском синхронизации

1. Разверните `src/services/firestore.rules` в Firebase Console → Firestore → Rules.
2. При первом запросе с фильтром `garageId` + `updatedAt` Firestore, скорее всего, попросит
   создать составной индекс — в логе будет прямая ссылка на консоль, просто перейдите по ней.
3. Модель гаража теперь полноценная (см. раздел выше про совместные гаражи) — `garageId`
   активного гаража хранится в `users/{uid}.activeGarageId` и по умолчанию равен uid владельца.

## Дальше (следующий спринт)

1. **Яндекс** — через кастомный OIDC-провайдер в Firebase Identity Platform (уже на Blaze
   после настройки Telegram — дополнительного перехода не нужно) + регистрация
   OAuth-приложения на yandex.ru/dev + WebView-флоу на клиенте (готового Яндекс SDK для
   Firebase на React Native нет).
2. OBD2: реализовать `Obd2Service` поверх `react-native-ble-plx` (сканирование
   устройств, подключение к ELM327, чтение PID для кодов ошибок — см. `src/services/obd2.ts`
   про ограничение с пробегом через стандартный OBD2).
3. Фото чеков в записях ТО/расходов через `react-native-image-picker`.
