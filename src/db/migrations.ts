import { schemaMigrations, addColumns, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        // Раньше напоминания бывали только про жидкости (related_fluid_type) — теперь
        // ещё и про ОСАГО/техосмотр. addColumns добавляет колонку как NULL у всех уже
        // существующих строк; отдельным шагом проставляем им 'fluid' — другого типа
        // напоминаний на момент этой миграции просто не существовало, так что это не
        // предположение, а факт. Два отдельных шага, а не унаследованный SQL от
        // addColumns с подставленным DEFAULT — чтобы не зависеть от того, как именно
        // WatermelonDB форматирует автосгенерированный ALTER TABLE в этой версии.
        addColumns({
          table: 'reminders',
          columns: [{ name: 'category', type: 'string' }],
        }),
        unsafeExecuteSql("UPDATE reminders SET category = 'fluid' WHERE category IS NULL"),
      ],
    },
    {
      // Пробег на момент заправки — без него нельзя посчитать настоящий расход
      // топлива (л/100км): не из чего узнать расстояние между заправками. У уже
      // стоящих заправок будет NULL — это нормально, разница в данных ДО того,
      // как человек начнёт их вписывать, просто не посчитается, а не поломает что-то.
      toVersion: 3,
      steps: [addColumns({ table: 'expenses', columns: [{ name: 'mileage', type: 'number', isOptional: true }] })],
    },
    {
      // Описание выполненных работ и разбивка стоимости на работы/запчасти. cost
      // остаётся итоговой суммой, у уже существующих записей новые поля — NULL: сколько
      // из старой суммы пошло на работы, а сколько на запчасти, мы не знаем и не
      // выдумываем.
      toVersion: 4,
      steps: [
        addColumns({
          table: 'service_records',
          columns: [
            { name: 'description', type: 'string', isOptional: true },
            { name: 'labor_cost', type: 'number', isOptional: true },
            { name: 'parts_cost', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      // Название для произвольных напоминаний. У существующих — NULL: у них название
      // и так вытекает из категории или типа жидкости.
      toVersion: 5,
      steps: [addColumns({ table: 'reminders', columns: [{ name: 'title', type: 'string', isOptional: true }] })],
    },
  ],
});
