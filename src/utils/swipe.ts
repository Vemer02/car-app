/**
 * Логика свайпа — отдельно от PanResponder, чтобы её можно было проверить тестом
 * без телефона. Все пороги в пикселях/скорости из gestureState.
 */

/** Жест начинаем "забирать" только когда он явно горизонтальный — иначе перехватили бы вертикальную прокрутку. */
export const CLAIM_MIN_DX = 14;
export const CLAIM_DOMINANCE = 1.5; // |dx| должен быть заметно больше |dy|
/** Для срабатывания: длинный жест, либо короткий, но быстрый. */
export const TRIGGER_DX = 60;
export const TRIGGER_DX_FAST = 30;
export const TRIGGER_VELOCITY = 0.5;

export function isHorizontalDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > CLAIM_MIN_DX && Math.abs(dx) > Math.abs(dy) * CLAIM_DOMINANCE;
}

export type SwipeDirection = 'left' | 'right';

/** 'left' — палец ушёл влево (листаем к следующему), 'right' — вправо (к предыдущему). */
export function swipeDirection(dx: number, dy: number, vx: number): SwipeDirection | null {
  if (Math.abs(dx) <= Math.abs(dy) * CLAIM_DOMINANCE) return null;
  const enough = Math.abs(dx) >= TRIGGER_DX || (Math.abs(dx) >= TRIGGER_DX_FAST && Math.abs(vx) >= TRIGGER_VELOCITY);
  if (!enough) return null;
  return dx < 0 ? 'left' : 'right';
}

/** Индекс соседа в списке с учётом границ (без зацикливания). null — идти некуда. */
export function neighborIndex(current: number, length: number, direction: SwipeDirection): number | null {
  const next = direction === 'left' ? current + 1 : current - 1;
  return next >= 0 && next < length ? next : null;
}
