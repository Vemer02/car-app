import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'cars',
      columns: [
        { name: 'garage_id', type: 'string', isIndexed: true },
        { name: 'make', type: 'string' },
        { name: 'model', type: 'string' },
        { name: 'year', type: 'number' },
        { name: 'vin', type: 'string', isOptional: true },
        { name: 'plate_number', type: 'string', isOptional: true },
        { name: 'photo_url', type: 'string', isOptional: true },
        { name: 'current_mileage', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true }, // для конфликт-резолвинга
      ],
    }),
    tableSchema({
      name: 'service_records',
      columns: [
        { name: 'car_id', type: 'string', isIndexed: true },
        { name: 'date', type: 'number' },
        { name: 'mileage', type: 'number' },
        { name: 'type', type: 'string' },
        { name: 'fluid_type', type: 'string', isOptional: true },
        { name: 'cost', type: 'number' },
        { name: 'service_name', type: 'string', isOptional: true },
        { name: 'photos', type: 'string' }, // JSON.stringify(string[])
        { name: 'source', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'expenses',
      columns: [
        { name: 'car_id', type: 'string', isIndexed: true },
        { name: 'category', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'date', type: 'number' },
        { name: 'fuel_volume', type: 'number', isOptional: true },
        { name: 'fuel_price', type: 'number', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'photo_url', type: 'string', isOptional: true },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'reminders',
      columns: [
        { name: 'car_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' },
        { name: 'target_mileage', type: 'number', isOptional: true },
        { name: 'target_date', type: 'number', isOptional: true },
        { name: 'related_fluid_type', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'calendar_synced', type: 'boolean' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
  ],
});
