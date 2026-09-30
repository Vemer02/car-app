import { synchronize, hasUnsyncedChanges } from '@nozbe/watermelondb/sync';
import type { SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { database } from './index';
import { apiFetch } from '../services/api';
import { getGarageId } from '../services/auth';
import { resetLocalDatabase } from '../services/localData';

// К какому гаражу относятся данные в локальной базе — хранится в localStorage самой
// WatermelonDB, поэтому стирается вместе с базой при сбросе.
const BOUND_GARAGE_KEY = 'boundGarageId';

/**
 * Одна синхронизация локальной базы с конкретным гаражом. garageId явный (не всегда
 * "текущий активный" на сервере) — см. runSync(): при смене гаража нужно сначала
 * докинуть несинхронизированное именно в СТАРЫЙ гараж, а не туда, куда переключились.
 * Сервер сам решает, какие поля отдавать/принимать — здесь нет ни грамма маппинга
 * полей (в отличие от версии на Firestore): API уже возвращает raw-записи ровно в
 * том виде, в котором их ждёт WatermelonDB.
 */
async function syncGarage(garageId: string): Promise<void> {
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const params = new URLSearchParams({ garageId });
      if (lastPulledAt != null) params.set('lastPulledAt', String(lastPulledAt));
      return apiFetch<{ changes: SyncDatabaseChangeSet; timestamp: number }>(`/v1/sync/pull?${params}`);
    },
    pushChanges: async ({ changes }) => {
      await apiFetch('/v1/sync/push', { method: 'POST', body: JSON.stringify({ changes, garageId }) });
    },
    sendCreatedAsUpdated: true,
  });
}

async function runSync(): Promise<void> {
  const garageId = getGarageId();
  if (!garageId) return; // не вошли, или активный гараж ещё не загрузился

  try {
    const bound = await database.localStorage.get<string>(BOUND_GARAGE_KEY);

    if (bound && bound !== garageId) {
      // Локальная база принадлежит другому гаражу: вступили в общий гараж, вышли из
      // него (в т.ч. на другом своём устройстве) или на телефоне вошёл другой аккаунт.
      // Сначала пробуем дослать несинхронизированные изменения ТУДА ЖЕ, где они были
      // сделаны (garageId=bound, не garageId=текущий!) — если доступ уже утрачен
      // (вышли из гаража), сервер вернёт 403, и мы просто идём дальше к сбросу.
      if (await hasUnsyncedChanges({ database })) {
        try {
          await syncGarage(bound);
        } catch (err) {
          console.warn('Could not flush changes to previous garage:', err);
        }
      }
      await resetLocalDatabase();
    }

    if (bound !== garageId) {
      await database.localStorage.set(BOUND_GARAGE_KEY, garageId);
    }

    await syncGarage(garageId);
  } catch (err) {
    // Офлайн или временная сетевая ошибка — не критично, следующий вызов досинхронизирует.
    console.warn('syncNow failed (will retry later):', err);
  }
}

let inFlight: Promise<void> | null = null;
let queued: Promise<void> | null = null;

/**
 * Запускает синхронизацию. Если она уже идёт — ставит в очередь ОДИН повторный прогон
 * (накопившиеся за это время изменения) и возвращает промис, который завершится вместе
 * с ним. Никогда не отклоняется.
 */
export function syncNow(): Promise<void> {
  if (!inFlight) {
    inFlight = runSync().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  if (!queued) {
    queued = inFlight.then(() => {
      queued = null;
      return syncNow();
    });
  }
  return queued;
}

/**
 * Для pull-to-refresh: не держать спиннер бесконечно. Без сети запрос к серверу может
 * зависнуть на таймауте самой ОС — сами данные при этом не теряются, просто отправятся
 * при следующей успешной попытке.
 */
export function syncWithTimeout(ms = 15000): Promise<void> {
  return Promise.race([syncNow(), new Promise<void>((r) => setTimeout(r, ms))]);
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Периодическая синхронизация, пока пользователь авторизован. Вызывать из App.tsx. */
export function startBackgroundSync(intervalMs = 60000): () => void {
  syncNow();
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(syncNow, intervalMs);
  return () => {
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = null;
  };
}
