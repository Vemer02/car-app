// Заполнить после включения провайдера в Firebase Console → Authentication → Sign-in method.
//
// GOOGLE_WEB_CLIENT_ID — это НЕ Android OAuth client, а именно "Web application" client ID
// из того же списка (Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs).
// Firebase создаёt его автоматически при включении Google-провайдера — найдёте в консоли
// Firebase на странице настроек провайдера Google ("Web SDK configuration").
export const GOOGLE_WEB_CLIENT_ID = 'REPLACE_ME.apps.googleusercontent.com';

// Имя бота без @, созданного через @BotFather (см. README, раздел «Вход через Telegram»).
export const TELEGRAM_BOT_USERNAME = 'REPLACE_ME_bot';
