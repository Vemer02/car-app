import { synchronize, hasUnsyncedChanges } from '@nozbe/watermelondb/sync';
import type { SyncDatabaseChangeSet, SyncTableChangeSet } from '@nozbe/watermelondb/sync';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { database } from './index';
import { getGarageId } from '../services/firebase';
import { resetLocalDatabase } from '../services/localData';

const db = firestore();
const serverNow = () => firestore.FieldValue.serverTimestamp();

// Таблицы WatermelonDB <-> коллекции Firestore — имена совпадают, поля — нет
// (локально snake_case по конвенции WatermelonDB, в Firestore camelCase).
const TABLES = ['cars', 'service_records', 'expenses', 'reminders'] as const;
type Table = (typeof TABLES)[number];

// К какому гаражу относятся данные в локальной базе. Хранится в localStorage самой
// WatermelonDB, поэтому стирается вместе с базой при сбросе.
const BOUND_GARAGE_KEY = 'boundGarageId';

// ---- Курсор синхронизации ---------------------------------------------------
//
// updatedAt пишется СЕРВЕРНЫМ временем (serverTimestamp), а курсором служит самый поздний
// updatedAt из того, что реально пришло с сервера. Так нет ни расхождения часов между
// телефонами, ни «дыры» между запросом и Date.now() (раньше изменения, записанные другим
// устройством в эту долю секунды, терялись навсегда).
// Курсор — микросекунды от эпохи: точность Timestamp в Firestore — микросекунды, и
// в double они до ~2255 года помещаются без потерь (в отличие от toMillis()).

function timestampToCursor(ts: FirebaseFirestoreTypes.Timestamp): number {
  return ts.seconds * 1_000_000 + Math.floor(ts.nanoseconds / 1000);
}

function cursorToTimestamp(cursor: number): FirebaseFirestoreTypes.Timestamp {
  const seconds = Math.floor(cursor / 1_000_000);
  const micros = cursor - seconds * 1_000_000;
  return new firestore.Timestamp(seconds, micros * 1000);
}

function toMillis(v: any): number | null {
  if (v == null) return null;
  return typeof v === 'number' ? v : v.toMillis?.() ?? null;
}

// ---- Конвертация: локальная raw-запись (snake_case) -> документ Firestore (camelCase) ----

const rawToFirestore: Record<Table, (raw: any, garageId: string) => Record<string, any>> = {
  cars: (raw, garageId) => ({
    garageId,
    make: raw.make,
    model: raw.model,
    year: raw.year,
    vin: raw.vin ?? null,
    plateNumber: raw.plate_number ?? null,
    photoUrl: raw.photo_url ?? null,
    currentMileage: raw.current_mileage,
    createdAt: raw.created_at,
    updatedAt: serverNow(),
    deletedAt: null,
  }),
  service_records: (raw, garageId) => ({
    garageId,
    carId: raw.car_id,
    date: raw.date,
    mileage: raw.mileage,
    type: raw.type,
    fluidType: raw.fluid_type ?? null,
    cost: raw.cost,
    serviceName: raw.service_name ?? null,
    photos: JSON.parse(raw.photos || '[]'),
    source: raw.source,
    createdAt: raw.created_at,
    updatedAt: serverNow(),
    deletedAt: null,
  }),
  expenses: (raw, garageId) => ({
    garageId,
    carId: raw.car_id,
    category: raw.category,
    amount: raw.amount,
    date: raw.date,
    fuelVolume: raw.fuel_volume ?? null,
    fuelPrice: raw.fuel_price ?? null,
    notes: raw.notes ?? null,
    photoUrl: raw.photo_url ?? null,
    updatedAt: serverNow(),
    deletedAt: null,
  }),
  reminders: (raw, garageId) => ({
    garageId,
    carId: raw.car_id,
    type: raw.type,
    targetMileage: raw.target_mileage ?? null,
    targetDate: raw.target_date ?? null,
    relatedFluidType: raw.related_fluid_type ?? null,
    status: raw.status,
    calendarSynced: !!raw.calendar_synced,
    updatedAt: serverNow(),
    deletedAt: null,
  }),
};

// ---- Обратная конвертация: документ Firestore (camelCase) -> raw-запись WatermelonDB (snake_case) ----

const firestoreToRaw: Record<Table, (id: string, data: any) => any> = {
  cars: (id, d) => ({
    id,
    garage_id: d.garageId,
    make: d.make,
    model: d.model,
    year: d.year,
    vin: d.vin ?? undefined,
    plate_number: d.plateNumber ?? undefined,
    photo_url: d.photoUrl ?? undefined,
    current_mileage: d.currentMileage,
    created_at: toMillis(d.createdAt),
    updated_at: toMillis(d.updatedAt),
  }),
  service_records: (id, d) => ({
    id,
    car_id: d.carId,
    date: toMillis(d.date),
    mileage: d.mileage,
    type: d.type,
    fluid_type: d.fluidType ?? undefined,
    cost: d.cost,
    service_name: d.serviceName ?? undefined,
    photos: JSON.stringify(d.photos ?? []),
    source: d.source,
    created_at: toMillis(d.createdAt),
  }),
  expenses: (id, d) => ({
    id,
    car_id: d.carId,
    category: d.category,
    amount: d.amount,
    date: toMillis(d.date),
    fuel_volume: d.fuelVolume ?? undefined,
    fuel_price: d.fuelPrice ?? undefined,
    notes: d.notes ?? undefined,
    photo_url: d.photoUrl ?? undefined,
  }),
  reminders: (id, d) => ({
    id,
    car_id: d.carId,
    type: d.type,
    target_mileage: d.targetMileage ?? undefined,
    target_date: toMillis(d.targetDate) ?? undefined,
    related_fluid_type: d.relatedFluidType ?? undefined,
    status: d.status,
    calendar_synced: !!d.calendarSynced,
  }),
};

/** Одна синхронизация локальной базы с конкретным гаражом. */
async function syncGarage(garageId: string): Promise<void> {
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const since = lastPulledAt ?? 0;
      let cursor = since;
      const changes: Record<string, SyncTableChangeSet> = {};

      for (const table of TABLES) {
        const snap = await db
          .collection(table)
          .where('garageId', '==', garageId)
          .where('updatedAt', '>', cursorToTimestamp(since))
          .get();

        const updated: any[] = [];
        const deleted: string[] = [];

        snap.docs.forEach((doc) => {
          const data = doc.data();
          if (data.updatedAt?.seconds != null) {
            cursor = Math.max(cursor, timestampToCursor(data.updatedAt));
          }
          if (data.deletedAt) {
            deleted.push(doc.id);
          } else {
            // Созданные и изменённые не различаем: с sendCreatedAsUpdated WatermelonDB
            // сама создаст запись из `updated`, если её нет локально.
            updated.push(firestoreToRaw[table](doc.id, data));
          }
        });

        changes[table] = { created: [], updated, deleted };
      }

      return { changes: changes as SyncDatabaseChangeSet, timestamp: cursor };
    },

    pushChanges: async ({ changes }) => {
      const tableChangesMap = changes as Record<string, SyncTableChangeSet | undefined>;
      let batch = db.batch();
      let opsInBatch = 0;

      const commitIfNeeded = async () => {
        if (opsInBatch >= 400) {
          // Firestore ограничивает батч 500 операциями — коммитим с запасом.
          await batch.commit();
          batch = db.batch();
          opsInBatch = 0;
        }
      };

      for (const table of TABLES) {
        const tableChanges = tableChangesMap[table];
        if (!tableChanges) continue;

        for (const raw of [...tableChanges.created, ...tableChanges.updated]) {
          const docRef = db.collection(table).doc(raw.id);
          batch.set(docRef, rawToFirestore[table](raw, garageId), { merge: true });
          opsInBatch++;
          await commitIfNeeded();
        }

        for (const id of tableChanges.deleted) {
          // garageId в «надгробии» обязателен: если запись создали и удалили до первой
          // синхронизации, этот set СОЗДАЁТ документ — и без garageId правила отклонили бы
          // весь батч, а синхронизация застряла бы на нём навсегда.
          const docRef = db.collection(table).doc(id);
          batch.set(docRef, { garageId, deletedAt: serverNow(), updatedAt: serverNow() }, { merge: true });
          opsInBatch++;
          await commitIfNeeded();
        }
      }

      if (opsInBatch > 0) await batch.commit();
    },

    sendCreatedAsUpdated: true,
  });
}

async function runSync(): Promise<void> {
  const garageId = getGarageId();
  if (!garageId) return; // не вошли или активный гараж ещё не загрузился

  try {
    const bound = await database.localStorage.get<string>(BOUND_GARAGE_KEY);

    if (bound && bound !== garageId) {
      // Локальная база принадлежит другому гаражу: пользователь вступил в общий гараж,
      // вышел из него (в т.ч. на другом своём устройстве) или на телефоне вошёл другой
      // аккаунт. Сначала пробуем дослать несинхронизированные изменения туда, где они
      // были сделаны (если доступ ещё есть), затем начисто перезаливаем базу.
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
    console.warn('syncWithFirestore failed (will retry later):', err);
  }
}

let inFlight: Promise<void> | null = null;
let queued: Promise<void> | null = null;

/**
 * Запускает синхронизацию. Если она уже идёт — ставит в очередь ОДИН повторный прогон
 * (накопившиеся за это время изменения) и возвращает промис, который завершится вместе
 * с ним. Никогда не отклоняется.
 */
export function syncWithFirestore(): Promise<void> {
  if (!inFlight) {
    inFlight = runSync().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  if (!queued) {
    queued = inFlight.then(() => {
      queued = null;
      return syncWithFirestore();
    });
  }
  return queued;
}

/**
 * Для pull-to-refresh: не держать спиннер бесконечно. Без сети запись в Firestore ждёт
 * подтверждения сервера сколько угодно долго (сами данные при этом не теряются — Firestore
 * держит их в своей очереди и отправит при появлении сети).
 */
export function syncWithTimeout(ms = 15000): Promise<void> {
  return Promise.race([syncWithFirestore(), new Promise<void>((r) => setTimeout(r, ms))]);
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Периодическая синхронизация, пока пользователь авторизован. Вызывать из App.tsx. */
export function startBackgroundSync(intervalMs = 60000): () => void {
  syncWithFirestore();
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(syncWithFirestore, intervalMs);
  return () => {
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = null;
  };
}
