// Форматирование и разбор дат вручную, а не через toLocaleDateString('ru-RU'):
// на части Android-устройств Intl-данные для ru-RU могут отсутствовать, и тогда
// поле даты по умолчанию заполнилось бы в формате, который сама же форма не примет.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Дата в формате ДД.ММ.ГГГГ. */
export function formatRuDate(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function todayRuDate(): string {
  return formatRuDate(new Date());
}

/**
 * Разбор ДД.ММ.ГГГГ (день и месяц можно одной цифрой). Возвращает null для
 * несуществующих дат — например, 31.02.2026 JS-овский Date молча превратил бы в 03.03.
 */
export function parseRuDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  const valid = d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  return valid ? d : null;
}
