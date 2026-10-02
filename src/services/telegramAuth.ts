import { Linking } from 'react-native';
import { apiFetch } from './api';
import { completeTelegramLogin } from './auth';
import { TELEGRAM_BOT_USERNAME } from '../config';

export interface TelegramLoginSession {
  token: string;
  secret: string;
}

/**
 * Начинает вход: и токен (публичная часть — уйдёт в ссылку на бота), и секрет создаёт
 * СЕРВЕР (см. mygarazh-server/src/telegramAuth.js) — на телефоне не нужен свой
 * криптостойкий генератор случайных чисел, которого в React Native нет из коробки.
 */
export async function startTelegramLogin(): Promise<TelegramLoginSession> {
  const { token, secret } = await apiFetch<{ token: string; secret: string }>('/v1/telegram/start', {
    method: 'POST',
    auth: false,
  });
  await Linking.openURL(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`);
  return { token, secret };
}

export type TelegramLoginOutcome = { status: 'success' } | { status: 'error'; message: string };

const POLL_INTERVAL_MS = 2000;
const GIVE_UP_AFTER_MS = 10 * 60 * 1000; // столько же, сколько живёт сама заявка на сервере

/**
 * Сервер — обычный REST без push-уведомлений, поэтому вместо живой подписки (как было
 * на Firestore) — опрос статуса раз в 2 секунды. Как только видит verified — сама
 * обменивает токен на вход. Возвращает функцию отмены (например, если экран закрыли).
 */
export function watchTelegramLogin(
  session: TelegramLoginSession,
  onOutcome: (o: TelegramLoginOutcome) => void,
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = Date.now() + GIVE_UP_AFTER_MS;

  async function tick() {
    if (cancelled) return;

    try {
      const { status } = await apiFetch<{ status: string }>(`/v1/telegram/status/${session.token}`, {
        auth: false,
      });

      if (status === 'verified') {
        try {
          await completeTelegramLogin(session.token, session.secret);
          if (!cancelled) onOutcome({ status: 'success' });
        } catch {
          if (!cancelled) onOutcome({ status: 'error', message: 'Не удалось завершить вход через Telegram' });
        }
        return;
      }
      if (status === 'rejected') {
        if (!cancelled) onOutcome({ status: 'error', message: 'Вход отменён в Telegram' });
        return;
      }
      if (status === 'expired' || status === 'not_found') {
        if (!cancelled) {
          onOutcome({ status: 'error', message: 'Время на подтверждение истекло. Начните вход заново' });
        }
        return;
      }
      // 'pending' — ждём дальше
    } catch {
      // сетевая заминка — не сдаёмся, попробуем на следующем тике
    }

    if (Date.now() > deadline) {
      if (!cancelled) onOutcome({ status: 'error', message: 'Не дождались подтверждения. Начните вход заново' });
      return;
    }
    timer = setTimeout(tick, POLL_INTERVAL_MS);
  }

  tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
