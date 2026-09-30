import { apiFetch, ApiError, isNetworkError } from './api';
import { signOutAndClear } from './session';

export type DeleteAccountResult = { status: 'success' } | { status: 'error'; message: string };

/**
 * Удаляет аккаунт целиком: профиль, свой гараж со всеми данными, заявки/приглашения и учётную
 * запись входа — на сервере (DELETE /v1/me, работает только при наличии связи).
 * Затем стирает локальную базу и выходит.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  try {
    await apiFetch('/v1/me', { method: 'DELETE' });
  } catch (err) {
    if (isNetworkError(err)) {
      return { status: 'error', message: 'Нет связи с сервером. Данные не удалены — проверьте интернет и повторите.' };
    }
    if (err instanceof ApiError && err.status >= 500) {
      return {
        status: 'error',
        message: 'Сервер ответил с ошибкой — удаление могло не завершиться. Повторите чуть позже: повторный запуск безопасен.',
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
