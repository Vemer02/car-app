/**
 * Простое вхождение подстроки, без учёта регистра. Пустой запрос считается совпадением
 * со всем — так экран показывает полный список, когда поле поиска ещё не тронули.
 */
export function matchesQuery(searchableText: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return searchableText.toLowerCase().includes(q);
}

/** Текст для поиска по записи ТО: имя работы, человекочитаемый тип, пробег, стоимость. */
export function serviceRecordSearchText(fields: {
  serviceName?: string | null;
  typeLabel: string;
  mileage: number;
  cost: number;
}): string {
  return [fields.serviceName ?? '', fields.typeLabel, String(fields.mileage), String(fields.cost)].join(' ');
}

/** Текст для поиска по расходу: заметка, человекочитаемая категория, сумма. */
export function expenseSearchText(fields: { notes?: string | null; categoryLabel: string; amount: number }): string {
  return [fields.notes ?? '', fields.categoryLabel, String(fields.amount)].join(' ');
}
