import { useCallback, useEffect, useRef, useState } from 'react';
import { startTelegramLogin, watchTelegramLink } from '../services/telegramAuth';

/**
 * Привязка Telegram к уже авторизованному аккаунту — для дублирующих уведомлений, не
 * для входа. Старт тот же самый (открыть бота), разница только в том, что происходит
 * после подтверждения — см. watchTelegramLink.
 */
export function useTelegramLink(onSuccess?: () => void) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    setVisible(true);
    try {
      const session = await startTelegramLogin();
      stopWatchRef.current = watchTelegramLink(session, (outcome) => {
        if (outcome.status === 'error') {
          setError(outcome.message);
        } else {
          setVisible(false);
          stop();
          onSuccess?.();
        }
      });
    } catch {
      setError('Не удалось открыть Telegram. Установлено ли приложение?');
    }
  }, [stop, onSuccess]);

  useEffect(() => stop, [stop]);

  const cancel = useCallback(() => {
    stop();
    setVisible(false);
  }, [stop]);

  return { visible, error, start, cancel };
}
