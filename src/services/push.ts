import { PermissionsAndroid, Platform } from 'react-native';
import RuStorePushSdk from 'react-native-rustore-push';
import { apiFetch } from './api';
import { RUSTORE_PUSH_PROJECT_ID } from '../config';

// ---- Граница с SDK RuStore -----------------------------------------------------------
//
// Honestly: это единственное место во всём проекте, которое я не смог проверить сам —
// у меня нет доступа к git-репозиторию, откуда ставится этот пакет (gitflic.ru), поэтому
// названия метода и форма конструктора ниже — по документации официального Kotlin SDK
// и короткому описанию JS-обёртки, а не по реально увиденному коду пакета. Если после
// сборки здесь будет ошибка типов или рантайма — это самое вероятное место, и чинится
// она точно так же, как мы чинили сервер: присылаете мне текст ошибки, я поправляю
// именно эти несколько строк, остальной файл их не касается.
//
let client: RuStorePushSdk | null = null;

function getClient() {
  if (!client) client = new RuStorePushSdk({ projectId: RUSTORE_PUSH_PROJECT_ID });
  return client;
}

async function getDeviceToken(): Promise<string | null> {
  try {
    const available = await getClient().checkPushAvailability();
    if (!available) return null; // нет приложения RuStore или пользователь не вошёл в него
    return await getClient().getToken();
  } catch (err) {
    console.warn('RuStore push: не удалось получить токен', err);
    return null;
  }
}

async function deleteDeviceToken(): Promise<void> {
  try {
    await getClient().deleteToken();
  } catch (err) {
    console.warn('RuStore push: не удалось удалить локальный токен', err);
  }
}

// ---- Остальное — обычная логика приложения, от SDK не зависит ------------------------

async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true; // до Android 13 разрешение не нужно
  const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  if (already) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

let lastRegisteredToken: string | null = null;

/**
 * Вызывать после того, как согласие на обработку данных уже дано (см. App.tsx) — до этого
 * момента отправлять что-либо на сервер, включая технический токен, не должны.
 * Не бросает исключений — пуши необязательны для работы остального приложения.
 */
export async function initPushNotifications(): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const token = await getDeviceToken();
    if (!token || token === lastRegisteredToken) return;

    await apiFetch('/v1/push/register', { method: 'POST', body: JSON.stringify({ token }) });
    lastRegisteredToken = token;
  } catch (err) {
    console.warn('Не удалось включить push-уведомления:', err);
  }
}

/** Включает/выключает дублирующие уведомления в Telegram-боте — сам telegram_id не трогает. */
export async function setTelegramNotificationsEnabled(enabled: boolean): Promise<void> {
  await apiFetch('/v1/push/telegram', { method: 'POST', body: JSON.stringify({ enabled }) });
}

/** Вызывать при выходе из аккаунта — чтобы напоминания чужого человека не приходили на этот телефон. */
export async function disablePushNotifications(): Promise<void> {
  try {
    if (lastRegisteredToken) {
      await apiFetch('/v1/push/unregister', { method: 'POST', body: JSON.stringify({ token: lastRegisteredToken }) }).catch(
        () => {}, // офлайн — не страшно, сервер и так перестанет слать через пару недель неактивного токена
      );
    }
    await deleteDeviceToken();
  } finally {
    lastRegisteredToken = null;
  }
}
