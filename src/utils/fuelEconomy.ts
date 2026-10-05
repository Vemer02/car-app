export interface FuelFillUp {
  date: Date;
  mileage: number | null | undefined;
  fuelVolume: number | null | undefined;
}

export interface FuelEconomySegment {
  fromDate: Date;
  toDate: Date;
  distanceKm: number;
  litersUsed: number;
  litersPer100km: number;
}

/**
 * Расход на каждом промежутке между двумя последовательными заправками (по дате), у
 * которых известны И пробег, И залитый объём. Классический способ "от заправки до
 * заправки": сколько залили на ВТОРОЙ заправке — это и есть то, что израсходовано на
 * путь с первой (считается, что каждый раз заливают полный бак — обычное допущение
 * всех подобных приложений, без него способ вообще не работает).
 */
export function computeFuelEconomy(fillUps: FuelFillUp[]): FuelEconomySegment[] {
  const sorted = fillUps.slice().sort((a, b) => a.date.getTime() - b.date.getTime());

  const segments: FuelEconomySegment[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    // Пара должна быть ДЕЙСТВИТЕЛЬНО соседней в последовательности — если у одной из
    // них нет пробега, нельзя "перепрыгнуть" через неё к следующей: это сложило бы
    // расстояние за ДВА цикла заправки с объёмом только ОДНОГО, дав заниженное число,
    // которое при этом выглядело бы совершенно правдоподобным.
    if (prev.mileage == null || curr.mileage == null || curr.fuelVolume == null) continue;
    const distanceKm = curr.mileage - prev.mileage;
    if (distanceKm <= 0) continue; // некорректные/повторные данные — пропускаем, не ломаем остальной расчёт
    segments.push({
      fromDate: prev.date,
      toDate: curr.date,
      distanceKm,
      litersUsed: curr.fuelVolume,
      litersPer100km: Math.round((curr.fuelVolume / distanceKm) * 1000) / 10,
    });
  }
  return segments;
}

/**
 * Средний расход по всем посчитанным промежуткам — одно число для карточки на экране.
 * Взвешенное по расстоянию (сумма литров / сумма км), не простое среднее по сегментам:
 * иначе один короткий и шумный промежуток исказил бы итог не меньше длинного.
 */
export function averageFuelEconomy(segments: FuelEconomySegment[]): number | null {
  if (segments.length === 0) return null;
  const totalLiters = segments.reduce((sum, s) => sum + s.litersUsed, 0);
  const totalKm = segments.reduce((sum, s) => sum + s.distanceKm, 0);
  if (totalKm === 0) return null;
  return Math.round((totalLiters / totalKm) * 1000) / 10;
}
