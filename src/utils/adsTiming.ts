/** Прошла ли пауза между показами рекламы. Никогда не показывали / часы ушли назад — можно. */
export function isCooldownOver(lastShownMs: number | null | undefined, nowMs: number, cooldownMs: number): boolean {
  if (cooldownMs <= 0 || lastShownMs == null) return true;
  if (lastShownMs > nowMs) return true; // время на телефоне перевели назад — не блокируем рекламу навсегда
  return nowMs - lastShownMs >= cooldownMs;
}

/** Ждёт промис не дольше ms. Не успел — вызывает onTimeout (например, отменить загрузку) и отдаёт null. */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      resolve(null);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null); // ошибка загрузки рекламы — это просто «рекламы нет», а не повод падать
      },
    );
  });
}
