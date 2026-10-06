/**
 * «Траты» = расходы + стоимость обслуживания. Запись ТО со стоимостью — это тоже расход
 * денег на машину, но хранится она в своей таблице. Копировать её в таблицу расходов
 * не стали: вторая копия разъезжалась бы с оригиналом (удалили запись ТО — расход остался
 * бы висеть). Вместо этого при показе подмешиваем записи ТО к расходам — источник правды
 * остаётся один, а удаление/правка в «Сервисе» сразу отражается и здесь.
 */

export const SERVICE_CATEGORY = 'service';

export interface SpendingItem<R = unknown> {
  /** Ключ для списка: у расходов и записей ТО id могут теоретически совпасть, поэтому с префиксом. */
  key: string;
  kind: 'expense' | 'service';
  date: Date;
  amount: number;
  /** Категория расхода, либо SERVICE_CATEGORY для записи ТО. */
  category: string;
  /** Исходная запись — чтобы экран мог, например, удалить расход. */
  ref: R;
}

export function expenseItem<R>(e: { id: string; date: Date; amount: number; category: string }, ref: R): SpendingItem<R> {
  return { key: `e:${e.id}`, kind: 'expense', date: e.date, amount: e.amount, category: e.category, ref };
}

/** Запись ТО без стоимости (0 или не указана) тратой не считается — пропускаем. */
export function serviceItem<R>(r: { id: string; date: Date; cost: number }, ref: R): SpendingItem<R> | null {
  if (!(r.cost > 0)) return null;
  return { key: `s:${r.id}`, kind: 'service', date: r.date, amount: r.cost, category: SERVICE_CATEGORY, ref };
}

/** Новые сверху; при равной дате порядок стабильный (расходы раньше обслуживания). */
export function mergeSpending<R>(items: Array<SpendingItem<R> | null>): SpendingItem<R>[] {
  return items
    .filter((i): i is SpendingItem<R> => i != null)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.date.getTime() - a.item.date.getTime() || a.index - b.index)
    .map(({ item }) => item);
}

export function sumSpending(items: SpendingItem[]): number {
  // Копейки: складываем в целых копейках, чтобы 0,1 + 0,2 не давало 0,30000000000000004.
  return Math.round(items.reduce((sum, i) => sum + Math.round(i.amount * 100), 0)) / 100;
}

export function groupByCategory(items: SpendingItem[]): { category: string; amount: number; pct: number }[] {
  const total = sumSpending(items);
  const map = new Map<string, number>();
  for (const i of items) map.set(i.category, (map.get(i.category) ?? 0) + Math.round(i.amount * 100));
  return Array.from(map.entries())
    .map(([category, kopecks]) => ({ category, amount: kopecks / 100, pct: total ? Math.round((kopecks / 100 / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
}
