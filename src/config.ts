// Адрес вашего сервера (mygarazh-server). Без слэша на конце.
export const API_BASE_URL = 'https://api.mygarazh-app.ru';

// Имя бота без @, созданного через @BotFather на сервере (см. README сервера,
// раздел «Вход через Telegram»).
export const TELEGRAM_BOT_USERNAME = 'REPLACE_ME_bot';

// ID проекта из RuStore Консоль → ваше приложение → «Push-уведомления» → «Проекты».
// Используется и здесь (SDK на телефоне), и при сборке (прописывается в AndroidManifest —
// см. scripts/ci.js), поэтому меняется в одном месте.
export const RUSTORE_PUSH_PROJECT_ID = 'REPLACE_ME_push_project_id';
