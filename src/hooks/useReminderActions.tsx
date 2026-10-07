import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { database } from '../db';
import { syncNow } from '../db/sync';
import ActionSheet, { type SheetAction } from '../components/ActionSheet';
import { reminderLabel } from '../utils/reminderDisplay';
import type Reminder from '../db/models/Reminder';

/**
 * Действия над напоминанием по нажатию на него: изменить / выполнено / удалить.
 * `onEdit` передаёт экран (у каждого своя навигация). Возвращает `open` — открыть лист
 * для напоминания, и `sheet` — элемент, который экран должен вставить в свой JSX.
 *
 * «Изменить» нет у напоминаний о жидкостях: их даты пересчитываются сами при внесении
 * записи ТО, ручная правка тут только запутала бы.
 */
export function useReminderActions(onEdit: (reminder: Reminder) => void) {
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const close = useCallback(() => setReminder(null), []);

  const markDone = async (r: Reminder) => {
    await database.write(async () => {
      await r.update((rec) => {
        rec.status = 'done';
      });
    });
    syncNow();
  };

  const confirmDelete = (r: Reminder) =>
    Alert.alert('Удалить напоминание?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await database.write(async () => {
            await r.markAsDeleted();
          });
          syncNow();
        },
      },
    ]);

  const actions: SheetAction[] = reminder
    ? [
        ...(reminder.category !== 'fluid' ? [{ label: 'Изменить', onPress: () => onEdit(reminder) }] : []),
        { label: 'Выполнено', onPress: () => markDone(reminder) },
        { label: 'Удалить', destructive: true, onPress: () => confirmDelete(reminder) },
      ]
    : [];

  const sheet = (
    <ActionSheet visible={reminder != null} title={reminder ? reminderLabel(reminder) : ''} actions={actions} onClose={close} />
  );

  return { open: setReminder, sheet };
}
