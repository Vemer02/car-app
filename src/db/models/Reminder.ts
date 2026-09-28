import { Model } from '@nozbe/watermelondb';
import { field, text, date, relation } from '@nozbe/watermelondb/decorators';

export default class Reminder extends Model {
  static table = 'reminders';
  static associations = {
    cars: { type: 'belongs_to', key: 'car_id' },
  } as const;

  @text('car_id') carId!: string;
  @text('type') type!: 'mileage' | 'date' | 'both';
  @field('target_mileage') targetMileage?: number;
  @date('target_date') targetDate?: Date;
  @text('related_fluid_type') relatedFluidType?: string;
  @text('status') status!: 'active' | 'done' | 'dismissed';
  @field('calendar_synced') calendarSynced!: boolean;

  @relation('cars', 'car_id') car: any;
}
