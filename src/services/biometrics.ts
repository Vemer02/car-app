import * as Keychain from 'react-native-keychain';

// Биометрия здесь — это НЕ альтернативный способ входа (сессия и так
// сохраняется нативным SDK между запусками), а замок поверх уже открытой сессии:
// включена — при возврате в приложение просим отпечаток/Face, прежде чем показать данные.
const LOCK_SERVICE = 'com.carapp.biometric_lock';

export async function isBiometrySupported(): Promise<boolean> {
  const type = await Keychain.getSupportedBiometryType();
  return type !== null;
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    const result = await Keychain.hasGenericPassword({ service: LOCK_SERVICE });
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Включает замок: кладёт маркер в Keychain с требованием биометрии для доступа.
 * Сам факт успешного вызова уже требует, чтобы на устройстве была настроена биометрия
 * (иначе setGenericPassword с этим accessControl выбросит ошибку).
 */
export async function enableBiometricLock(): Promise<boolean> {
  try {
    await Keychain.setGenericPassword('app-lock', 'enabled', {
      service: LOCK_SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch {
    return false;
  }
}

export async function disableBiometricLock(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: LOCK_SERVICE });
  } catch {
    // нечего отключать — и ладно
  }
}

/**
 * Показывает системный диалог биометрии. true — прошла, false — отменена/не совпала/недоступна.
 */
export async function verifyBiometric(prompt = 'Разблокируйте приложение'): Promise<boolean> {
  try {
    const result = await Keychain.getGenericPassword({
      service: LOCK_SERVICE,
      authenticationPrompt: { title: prompt },
    });
    return !!result;
  } catch {
    return false;
  }
}
