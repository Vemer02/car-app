import { useCallback, useEffect, useRef, useState } from 'react';
import { startTelegramLogin, watchTelegramLogin } from '../services/telegramAuth';

export function useTelegramLogin() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    setVisible(true);
    try {
      const session = await startTelegramLogin();
      unsubscribeRef.current = watchTelegramLogin(session, (outcome) => {
        if (outcome.status === 'error') {
          setError(outcome.message);
        } else {
          // 'success' — дальше навигацией управляет App.tsx через onAuthStateChanged.
          setVisible(false);
          stop();
        }
      });
    } catch {
      setError('Не удалось открыть Telegram. Установлено ли приложение?');
    }
  }, [stop]);

  // Если экран закрыли посреди входа — не оставляем висеть подписку на Firestore.
  useEffect(() => stop, [stop]);

  const cancel = useCallback(() => {
    stop();
    setVisible(false);
  }, [stop]);

  return { visible, error, start, cancel };
}
