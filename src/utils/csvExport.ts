/**
 * CSV под Excel с русской локалью: точка с запятой — разделитель колонок (не запятая —
 * она там десятичный разделитель), поэтому и дробные числа тоже через запятую, а не
 * точку — иначе обычная таблица типа "1500,50;Замена масла" развалится в Excel на
 * лишнюю колонку прямо посередине суммы.
 */
const DELIMITER = ';';
// Без этого маркера Excel может открыть кириллицу как нечитаемые символы — он определяет
// кодировку файла по его наличию, не угадывает UTF-8 сам.
const UTF8_BOM = '\uFEFF';

function csvEscape(value: string): string {
  if (value.includes(DELIMITER) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvNumber(n: number): string {
  return String(n).replace('.', ',');
}

function csvRow(fields: string[]): string {
  return fields.map(csvEscape).join(DELIMITER);
}

function buildCsv(header: string[], rows: string[][]): string {
  return UTF8_BOM + [csvRow(header), ...rows.map(csvRow)].join('\r\n');
}

export interface ServiceRecordCsvRow {
  dateLabel: string;
  typeLabel: string;
  serviceName: string | null | undefined;
  mileage: number;
  cost: number;
}

export function buildServiceRecordsCsv(rows: ServiceRecordCsvRow[]): string {
  return buildCsv(
    ['Дата', 'Тип', 'Работа', 'Пробег, км', 'Стоимость, ₽'],
    rows.map((r) => [r.dateLabel, r.typeLabel, r.serviceName ?? '', String(r.mileage), csvNumber(r.cost)]),
  );
}

export interface ExpenseCsvRow {
  dateLabel: string;
  categoryLabel: string;
  notes: string | null | undefined;
  amount: number;
}

export function buildExpensesCsv(rows: ExpenseCsvRow[]): string {
  return buildCsv(
    ['Дата', 'Категория', 'Заметка', 'Сумма, ₽'],
    rows.map((r) => [r.dateLabel, r.categoryLabel, r.notes ?? '', csvNumber(r.amount)]),
  );
}
