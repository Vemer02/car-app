import { Model } from '@nozbe/watermelondb';
import { field, text, date, relation } from '@nozbe/watermelondb/decorators';

export default class Expense extends Model {
  static table = 'expenses';
  static associations = {
    cars: { type: 'belongs_to', key: 'car_id' },
  } as const;

  @text('car_id') carId!: string;
  @text('category') category!: string;
  @field('amount') amount!: number;
  @date('date') date!: Date;
  @field('fuel_volume') fuelVolume?: number;
  @field('fuel_price') fuelPrice?: number;
  @text('notes') notes?: string;
  @text('photo_url') photoUrl?: string;

  @relation('cars', 'car_id') car: any;
}
