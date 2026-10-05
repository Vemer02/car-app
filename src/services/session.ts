import { hasUnsyncedChanges } from '@nozbe/watermelondb/sync';
import { database } from '../db';
import { syncWithTimeout } from '../db/sync';
import { signOut } from './auth';
import { resetLocalDatabase } from './localData';
import { disableBiometricLock } from './biometrics';
import { disablePushNotifications } from './push';

/** Есть ли локальные изменения, которые ещё не ушли в облако (для предупреждения перед выходом). */
export async function hasPendingLocalChanges(): Promise<boolean> {
  await syncWithTimeout(8000);
  return hasUnsyncedChanges({ database });
}

/**
 * Выход из аккаунта с очисткой локальных данных. Без очистки следующий аккаунт на этом
 * телефоне увидел бы машины и расходы предыдущего пользователя, а его несинхронизированные
 * записи ушли бы в чужой гараж.
 */
export async function signOutAndClear(): Promise<void> {
  // Сначала снимаем push — пока токен доступа ещё рабочий: /v1/push/unregister требует
  // авторизации, а после signOut() её уже не будет.
  await disablePushNotifications();
  // Порядок важен: сначала выход — активный гараж становится null, и фоновая синхронизация
  // перестаёт что-либо делать; иначе она успела бы между очисткой и выходом снова залить
  // в базу данные уходящего пользователя.
  await signOut();
  await resetLocalDatabase();
  // Замок по биометрии — настройка конкретного аккаунта на этом устройстве, не наследуем.
  await disableBiometricLock();
}
