import { useEffect, useMemo, useState } from 'react';
import Reminder from '../db/models/Reminder';
import Expense from '../db/models/Expense';
import ServiceRecord from '../db/models/ServiceRecord';
import { observeActiveReminders, observeExpensesBetween, observeServiceRecordsBetween } from '../db/queries';
import { expenseItem, serviceItem, mergeSpending, sumSpending } from '../utils/spending';
import { useActiveCar } from '../context/ActiveCarContext';

// Регламентные интервалы по умолчанию — пока нет базы регламентов по маркам/моделям
// (сознательное решение для MVP), используются только чтобы оценить % ресурса для прогресс-бара.
const DEFAULT_MILEAGE_INTERVAL: Record<string, number> = {
  engine_oil: 10000,
  transmission: 60000,
  brake: 40000,
  coolant: 60000,
  power_steering: 60000,
};
const DEFAULT_DATE_INTERVAL_DAYS = 365;

export interface UpcomingService {
  reminder: Reminder;
  progress: number; // 0..1, доля пройденного интервала
  dueLabel: string;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function startOfNextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function computeMileageProgress(currentMileage: number, targetMileage: number, fluidType?: string): number {
  const interval = (fluidType && DEFAULT_MILEAGE_INTERVAL[fluidType]) || 10000;
  const remaining = targetMileage - currentMileage;
  const progress = 1 - remaining / interval;
  return Math.min(1, Math.max(0, progress));
}

function computeDateProgress(targetDate: Date): number {
  const remainingMs = targetDate.getTime() - Date.now();
  const remainingDays = remainingMs / (1000 * 60 * 60 * 24);
  const progress = 1 - remainingDays / DEFAULT_DATE_INTERVAL_DAYS;
  return Math.min(1, Math.max(0, progress));
}

function formatMileageDue(currentMileage: number, targetMileage: number): string {
  const diff = targetMileage - currentMileage;
  if (diff <= 0) return `просрочено на ${Math.abs(diff).toLocaleString('ru-RU')} км`;
  return `через ${diff.toLocaleString('ru-RU')} км`;
}

function formatDateDue(targetDate: Date): string {
  const diffDays = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `просрочено на ${Math.abs(diffDays)} дн.`;
  if (diffDays === 0) return 'сегодня';
  if (diffDays <= 31) return `через ${diffDays} дн.`;
  return `до ${targetDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
}

export function reminderDueLabel(reminder: Reminder, currentMileage: number): string {
  if (reminder.type === 'mileage' && reminder.targetMileage != null) {
    return formatMileageDue(currentMileage, reminder.targetMileage);
  }
  if (reminder.type === 'date' && reminder.targetDate) {
    return formatDateDue(reminder.targetDate);
  }
  if (reminder.type === 'both' && reminder.targetMileage != null && reminder.targetDate) {
    // Показываем то, что наступит раньше
    const byMileageDiff = reminder.targetMileage - currentMileage;
    const byDateDays = Math.ceil((reminder.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    // ~30 км/день — грубая эвристика только для сортировки отображения
    return byMileageDiff / 30 < byDateDays
      ? formatMileageDue(currentMileage, reminder.targetMileage)
      : formatDateDue(reminder.targetDate);
  }
  return '';
}

export function reminderUrgencyScore(reminder: Reminder, currentMileage: number): number {
  // Меньше — срочнее. Используется только для сортировки списка напоминаний.
  const scores: number[] = [];
  if (reminder.targetMileage != null) scores.push(reminder.targetMileage - currentMileage);
  if (reminder.targetDate) {
    const days = (reminder.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    scores.push(days * 30); // грубое приведение дней к «километрам» для сравнения
  }
  return scores.length ? Math.min(...scores) : Infinity;
}

export function useDashboardData() {
  const { activeCar, loading: carLoading } = useActiveCar();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [recentServices, setRecentServices] = useState<ServiceRecord[]>([]);

  useEffect(() => {
    if (!activeCar) {
      setReminders([]);
      return;
    }
    const sub = observeActiveReminders(activeCar.id).subscribe(setReminders);
    return () => sub.unsubscribe();
  }, [activeCar?.id]);

  // Берём и текущий месяц, и последние 7 дней: в первые дни месяца неделя для мини-графика
  // захватывает прошлый месяц — раньше эти дни на графике ошибочно были пустыми.
  useEffect(() => {
    if (!activeCar) {
      setRecentExpenses([]);
      return;
    }
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const from = Math.min(startOfMonth(now), startOfDay(weekAgo));
    const sub = observeExpensesBetween(activeCar.id, from, startOfNextMonth(now)).subscribe(setRecentExpenses);
    return () => sub.unsubscribe();
  }, [activeCar?.id]);

  // Обслуживание — тоже трата (запись ТО со стоимостью), считаем его вместе с расходами —
  // иначе на главном экране суммы расходятся с экраном «Расходы». См. utils/spending.ts.
  useEffect(() => {
    if (!activeCar) {
      setRecentServices([]);
      return;
    }
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const from = Math.min(startOfMonth(now), startOfDay(weekAgo));
    const sub = observeServiceRecordsBetween(activeCar.id, from, startOfNextMonth(now)).subscribe(setRecentServices);
    return () => sub.unsubscribe();
  }, [activeCar?.id]);

  const recentSpending = useMemo(
    () =>
      mergeSpending([
        ...recentExpenses.map((e) => expenseItem(e, null)),
        ...recentServices.map((r) => serviceItem(r, null)),
      ]),
    [recentExpenses, recentServices],
  );

  const sortedReminders = useMemo(() => {
    if (!activeCar) return [];
    return [...reminders].sort(
      (a, b) => reminderUrgencyScore(a, activeCar.currentMileage) - reminderUrgencyScore(b, activeCar.currentMileage),
    );
  }, [reminders, activeCar?.currentMileage]);

  const upcomingService: UpcomingService | null = useMemo(() => {
    if (!activeCar || sortedReminders.length === 0) return null;
    const reminder = sortedReminders[0];
    let progress = 0;
    if (reminder.type !== 'date' && reminder.targetMileage != null) {
      progress = computeMileageProgress(activeCar.currentMileage, reminder.targetMileage, reminder.relatedFluidType);
    } else if (reminder.targetDate) {
      progress = computeDateProgress(reminder.targetDate);
    }
    return { reminder, progress, dueLabel: reminderDueLabel(reminder, activeCar.currentMileage) };
  }, [sortedReminders, activeCar?.currentMileage]);

  const monthTotal = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    return sumSpending(recentSpending.filter((i) => i.date.getTime() >= monthStart));
  }, [recentSpending]);

  // Суммы по последним 7 дням — для мини-графика на Dashboard
  const dailyTotals = useMemo(() => {
    const days: { label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = startOfDay(d);
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const total = sumSpending(recentSpending.filter((i) => i.date.getTime() >= dayStart && i.date.getTime() < dayEnd));
      days.push({ label: d.toLocaleDateString('ru-RU', { weekday: 'short' }), total });
    }
    return days;
  }, [recentSpending]);

  return {
    car: activeCar,
    loading: carLoading,
    reminders: sortedReminders,
    upcomingService,
    monthTotal,
    dailyTotals,
  };
}
