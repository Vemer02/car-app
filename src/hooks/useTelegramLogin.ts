import { useCallback, useEffect, useRef, useState } from 'react';
import { startTelegramLogin, watchTelegramLogin } from '../services/telegramAuth';

export function useTelegramLogin(onSuccess?: () => void) {
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
      stopWatchRef.current = watchTelegramLogin(session, (outcome) => {
        if (outcome.status === 'error') {
          setError(outcome.message);
        } else {
          // 'success' — дальше навигацией управляет App.tsx по состоянию сессии.
          setVisible(false);
          stop();
          onSuccess?.();
        }
      });
    } catch {
      setError('Не удалось открыть Telegram. Установлено ли приложение?');
    }
  }, [stop, onSuccess]);

  // Если экран закрыли посреди входа — не оставляем опрос сервера висеть вхолостую.
  useEffect(() => stop, [stop]);

  const cancel = useCallback(() => {
    stop();
    setVisible(false);
  }, [stop]);

  return { visible, error, start, cancel };
}
