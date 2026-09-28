import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import Car from './models/Car';
import ServiceRecord from './models/ServiceRecord';
import Expense from './models/Expense';
import Reminder from './models/Reminder';

const adapter = new SQLiteAdapter({
  schema,
  // JSI-режим быстрее, но требует ручной нативной настройки Android (settings.gradle,
  // MainApplication). Обычный режим через bridge подключается автоматически и для
  // объёмов данных этого приложения (десятки-сотни записей) по скорости неотличим.
  jsi: false,
  onSetUpError: (error) => {
    // TODO: отправлять в Crashlytics
    console.error('WatermelonDB setup error', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Car, ServiceRecord, Expense, Reminder],
});
