import { useCallback, useRef, useState } from 'react';
import { startYandexLogin, inspectYandexNavigation, finishYandexLogin } from '../services/yandexAuth';
import type { YandexLoginSession } from '../services/yandexAuth';

export function useYandexLogin(onSuccess?: () => void) {
  const [session, setSession] = useState<YandexLoginSession | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false); // WebView шлёт несколько событий навигации на один переход

  const start = useCallback(async () => {
    setError(null);
    handledRef.current = false;
    try {
      const s = await startYandexLogin();
      setSession(s);
    } catch {
      setError('Не удалось открыть окно входа. Проверьте соединение');
    }
  }, []);

  const cancel = useCallback(() => {
    setSession(null);
    setError(null);
  }, []);

  const onNavigate = useCallback(
    (url: string) => {
      if (!session || handledRef.current) return;
      const result = inspectYandexNavigation(url, session.redirectPrefix);
      if (result.kind === 'ignore') return;

      handledRef.current = true;
      if ('error' in result) {
        setError(result.error === 'access_denied' ? 'Вход отменён' : 'Не удалось войти через Яндекс');
        setSession(null);
        return;
      }

      setExchanging(true);
      finishYandexLogin(result.code, result.state).then((outcome) => {
        setExchanging(false);
        setSession(null);
        if (outcome.status === 'error') {
          setError(outcome.message);
        } else {
          // дальше навигацией управляет App.tsx по состоянию сессии
          onSuccess?.();
        }
      });
    },
    [session, onSuccess],
  );

  return { session, exchanging, error, start, cancel, onNavigate };
}
