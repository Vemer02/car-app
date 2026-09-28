import { Model } from '@nozbe/watermelondb';
import { field, text, date, relation, json } from '@nozbe/watermelondb/decorators';

const sanitizePhotos = (raw: any) => (Array.isArray(raw) ? raw : []);

export default class ServiceRecord extends Model {
  static table = 'service_records';
  static associations = {
    cars: { type: 'belongs_to', key: 'car_id' },
  } as const;

  @text('car_id') carId!: string;
  @date('date') date!: Date;
  @field('mileage') mileage!: number;
  @text('type') type!: string;
  @text('fluid_type') fluidType?: string;
  @field('cost') cost!: number;
  @text('service_name') serviceName?: string;
  @json('photos', sanitizePhotos) photos!: string[];
  @text('source') source!: 'manual' | 'obd2';
  @date('created_at') createdAt!: Date;

  @relation('cars', 'car_id') car: any;
}
