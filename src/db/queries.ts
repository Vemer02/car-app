import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import Car from './models/Car';
import ServiceRecord from './models/ServiceRecord';
import Expense from './models/Expense';
import Reminder from './models/Reminder';

export const carsCollection = database.get<Car>('cars');
export const serviceRecordsCollection = database.get<ServiceRecord>('service_records');
export const expensesCollection = database.get<Expense>('expenses');
export const remindersCollection = database.get<Reminder>('reminders');

// ВАЖНО: .observe() в WatermelonDB реагирует только на появление/исчезновение записей в
// выборке, но НЕ на изменение полей уже попавших в неё записей. Там, где поля меняются
// (пробег машины, цель напоминания), нужен observeWithColumns — иначе экран покажет
// старое значение до следующей перерисовки по другой причине.

export function observeAllCars() {
  return carsCollection
    .query(Q.sortBy('created_at', Q.asc))
    .observeWithColumns(['current_mileage', 'make', 'model', 'year', 'plate_number', 'vin']);
}

export function observeActiveReminders(carId: string) {
  return remindersCollection
    .query(Q.where('car_id', carId), Q.where('status', 'active'))
    .observeWithColumns(['target_mileage', 'target_date', 'type', 'related_fluid_type']);
}

export function observeRecentServiceRecords(carId: string, limit = 10) {
  return serviceRecordsCollection
    .query(Q.where('car_id', carId), Q.sortBy('date', Q.desc), Q.take(limit))
    .observe();
}

export function observeExpensesBetween(carId: string, fromMs: number, toMs: number) {
  return expensesCollection
    .query(
      Q.where('car_id', carId),
      Q.where('date', Q.gte(fromMs)),
      Q.where('date', Q.lt(toMs)),
      Q.sortBy('date', Q.desc),
    )
    .observe();
}
