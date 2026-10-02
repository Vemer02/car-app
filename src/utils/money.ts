/**
 * Ввод суммы с копейками (стоимость ТО, сумма расхода). Раньше поля чистились через
 * `.replace(/\D/g, '')` — это вырезает точку/запятую вместе с прочим мусором, поэтому
 * «1500,50» превращалось в «150050» (в 100 раз больше введённого), а не в 1500 рублей
 * 50 копеек. Здесь — посимвольный разбор: цифры пропускаются всегда, разделитель
 * (запятая ИЛИ точка) — только один, и не больше двух цифр после него.
 */
export function sanitizeMoneyInput(raw: string): string {
  let result = '';
  let hasSeparator = false;
  let decimals = 0;

  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      if (hasSeparator) {
        if (decimals >= 2) continue;
        decimals++;
      }
      result += ch;
    } else if ((ch === ',' || ch === '.') && !hasSeparator) {
      hasSeparator = true;
      result += '.';
    }
    // всё остальное (буквы, второй разделитель, минус и т.д.) — просто отбрасывается
  }

  return result;
}

/** null — пусто или некорректно (например, одна точка без цифр). */
export function parseMoney(text: string): number | null {
  const sanitized = sanitizeMoneyInput(text);
  if (!sanitized || sanitized === '.') return null;
  const value = parseFloat(sanitized);
  return Number.isFinite(value) ? value : null;
}
