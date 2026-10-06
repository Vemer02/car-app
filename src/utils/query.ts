/**
 * Сборка и разбор строки запроса БЕЗ URLSearchParams. Во встроенной в React Native версии
 * get/set/has/delete/getAll намеренно бросают "not implemented", а конструктор от строки
 * создаёт пустой набор — в Node (где мы проверяем код) всё это работает, поэтому ошибка
 * всплывает только на телефоне. Не возвращайте URLSearchParams — см. scripts/check-rn-apis.js.
 */

export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value; // битая %-последовательность в чужом URL — отдаём как есть, а не падаем
  }
}

export function parseQuery(query: string): Record<string, string> {
  const result: Record<string, string> = {};
  const clean = query.startsWith('?') ? query.slice(1) : query;
  for (const part of clean.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = safeDecode(eq === -1 ? part : part.slice(0, eq));
    if (key && !(key in result)) result[key] = eq === -1 ? '' : safeDecode(part.slice(eq + 1));
  }
  return result;
}
