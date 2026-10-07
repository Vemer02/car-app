import { parseRuDate } from './date';
import type { ReminderCategory } from '../types/models';

export type ReminderKind = Exclude<ReminderCategory, 'fluid'>;

export interface ReminderFormInput {
  kind: ReminderKind;
  title: string;
  dateText: string;
  mileageText: string;
  /** Текущий пробег машины, если известен — цель по пробегу должна быть больше него. */
  currentMileage: number | null;
}

export interface ReminderFormResult {
  errors: Record<string, string>;
  date: Date | null;
  mileage: number | null;
  /** По чему напоминать; null — если форма невалидна. */
  type: 'date' | 'mileage' | 'both' | null;
}

/**
 * Проверка формы напоминания — отдельно от экрана, чтобы покрыть тестом. ОСАГО/техосмотр:
 * дата обязательна. «Своё»: нужно название и хотя бы одно из — дата или пробег
 * (если указаны оба, напомним по тому, что наступит раньше).
 */
export function validateReminderForm(input: ReminderFormInput): ReminderFormResult {
  const errors: Record<string, string> = {};
  const isCustom = input.kind === 'custom';

  const hasDate = input.dateText.trim() !== '';
  const date = hasDate ? parseRuDate(input.dateText) : null;
  if (hasDate && !date) errors.date = 'Укажите существующую дату в формате ДД.ММ.ГГГГ';

  const hasMileage = isCustom && input.mileageText.trim() !== '';
  let mileage: number | null = null;
  if (hasMileage) {
    mileage = parseInt(input.mileageText.replace(/\D/g, ''), 10);
    if (!Number.isFinite(mileage) || mileage <= 0 || mileage > 2000000) {
      errors.mileage = 'Укажите пробег в километрах';
      mileage = null;
    } else if (input.currentMileage != null && mileage <= input.currentMileage) {
      errors.mileage = `Должен быть больше текущего пробега (${input.currentMileage.toLocaleString('ru-RU')} км)`;
    }
  }

  if (isCustom) {
    if (!input.title.trim()) errors.title = 'Напишите, о чём напомнить';
    if (!hasDate && !hasMileage) errors.date = 'Укажите дату или пробег — иначе напоминать не о чем';
  } else if (!hasDate) {
    errors.date = 'Укажите дату окончания';
  }

  if (Object.keys(errors).length > 0) return { errors, date, mileage, type: null };
  const type = !isCustom ? 'date' : date && mileage != null ? 'both' : date ? 'date' : 'mileage';
  return { errors, date, mileage, type };
}
