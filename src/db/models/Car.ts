import { Model } from '@nozbe/watermelondb';
import { field, text, date, children } from '@nozbe/watermelondb/decorators';

export default class Car extends Model {
  static table = 'cars';
  static associations = {
    service_records: { type: 'has_many', foreignKey: 'car_id' },
    expenses: { type: 'has_many', foreignKey: 'car_id' },
    reminders: { type: 'has_many', foreignKey: 'car_id' },
  } as const;

  @text('garage_id') garageId!: string;
  @text('make') make!: string;
  @text('model') model!: string;
  @field('year') year!: number;
  @text('vin') vin?: string;
  @text('plate_number') plateNumber?: string;
  @text('photo_url') photoUrl?: string;
  @field('current_mileage') currentMileage!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('service_records') serviceRecords: any;
  @children('expenses') expenses: any;
  @children('reminders') reminders: any;
}
