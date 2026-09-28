import { database } from '../db';

// WatermelonDB при unsafeResetDatabase() молча выбрасывает все активные подписки
// ("App should not hold onto subscriptions ... while resetting database") — экраны после
// этого «замерзают» до перезапуска приложения. Поэтому сброс идёт в три шага:
//   1) фаза 'resetting' → App.tsx размонтирует всё дерево, подписанное на базу;
//   2) App подтверждает размонтирование (acknowledgeDataUiUnmounted) → сбрасываем базу;
//   3) фаза 'ready' → App монтирует дерево заново, с новыми подписками.

export type LocalDataPhase = 'ready' | 'resetting';

let phase: LocalDataPhase = 'ready';
const listeners = new Set<() => void>();
let pendingUnmountAck: (() => void) | null = null;

function setPhase(next: LocalDataPhase) {
  phase = next;
  listeners.forEach((l) => l());
}

export function getLocalDataPhase(): LocalDataPhase {
  return phase;
}

export function subscribeLocalDataPhase(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Вызывается из App.tsx после того, как дерево с подписками на базу размонтировано. */
export function acknowledgeDataUiUnmounted() {
  pendingUnmountAck?.();
  pendingUnmountAck = null;
}

let resetInFlight: Promise<void> | null = null;

/** Полностью очищает локальную базу (включая lastPulledAt и привязку к гаражу). */
export function resetLocalDatabase(): Promise<void> {
  if (resetInFlight) return resetInFlight;

  resetInFlight = (async () => {
    const unmounted = new Promise<void>((resolve) => {
      pendingUnmountAck = resolve;
    });
    setPhase('resetting');
    // Страховка: если по какой-то причине App не подтвердит (например, ещё не смонтирован) —
    // не висим вечно.
    await Promise.race([unmounted, new Promise((r) => setTimeout(r, 1500))]);
    try {
      await database.write(() => database.unsafeResetDatabase());
    } finally {
      pendingUnmountAck = null;
      setPhase('ready');
      resetInFlight = null;
    }
  })();

  return resetInFlight;
}
