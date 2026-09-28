import functions from '@react-native-firebase/functions';
import { pauseUserDocWatch, resumeUserDocWatch } from './firebase';
import { signOutAndClear } from './session';

export type DeleteAccountResult = { status: 'success' } | { status: 'error'; message: string };

/**
 * Удаляет аккаунт целиком: профиль, свой гараж со всеми данными, заявки/приглашения и учётную
 * запись входа — на сервере (Cloud Function deleteMyAccount, работает только при наличии связи).
 * Затем стирает локальную базу и выходит.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  pauseUserDocWatch();
  try {
    // Удаление больших гаражей идёт пачками — даём функции запас времени (по умолчанию клиент ждёт 70 с).
    await functions().httpsCallable('deleteMyAccount', { timeout: 300000 })();
  } catch (err: any) {
    resumeUserDocWatch();
    if (err?.code === 'functions/unavailable') {
      return { status: 'error', message: 'Нет связи с сервером. Данные не удалены — проверьте интернет и повторите.' };
    }
    if (err?.code === 'functions/deadline-exceeded') {
      // Неизвестно, успел ли сервер что-то удалить: честно говорим об этом.
      return {
        status: 'error',
        message: 'Сервер не ответил вовремя — удаление могло уже начаться. Повторите чуть позже: повторный запуск безопасен.',
      };
    }
    return { status: 'error', message: 'Не удалось удалить аккаунт. Попробуйте ещё раз позже.' };
  }

  // Сервер уже всё удалил. Ошибка локальной очистки не должна выглядеть как «не удалось».
  try {
    await signOutAndClear();
  } catch (err) {
    console.warn('Local cleanup after account deletion failed:', err);
  }
  return { status: 'success' };
}
