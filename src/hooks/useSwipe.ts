import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import { isHorizontalDrag, swipeDirection, type SwipeDirection } from '../utils/swipe';

export interface SwipeExtras {
  /** Палец движется (уже после того, как жест признан горизонтальным) — dx в пикселях от начала жеста. */
  onMove?: (dx: number) => void;
  /** Жест закончился, но до порога не дотянул (или был прерван) — вернуть всё на место. */
  onCancel?: () => void;
}

/**
 * Свайп влево/вправо для любого View: `<View {...useSwipe(cb)}>`.
 * Жест забирается только когда он явно горизонтальный — вертикальная прокрутка и
 * обычные нажатия не страдают. Вложенный View со своим useSwipe выигрывает у внешнего
 * (при согласовании жеста первым спрашивают самый вложенный) — на этом держится
 * "смена машины свайпом по пробегу внутри экрана, который сам листается свайпом".
 *
 * onSwipe — жест дотянул до порога; onMove/onCancel нужны для анимации "за пальцем".
 */
export function useSwipe(onSwipe: (direction: SwipeDirection) => void, extras: SwipeExtras = {}) {
  // Свежие колбэки без пересоздания PanResponder на каждый рендер.
  const handlers = useRef({ onSwipe, ...extras });
  handlers.current = { onSwipe, ...extras };

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => isHorizontalDrag(g.dx, g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => handlers.current.onMove?.(g.dx),
        onPanResponderRelease: (_e, g) => {
          const direction = swipeDirection(g.dx, g.dy, g.vx);
          if (direction) handlers.current.onSwipe(direction);
          else handlers.current.onCancel?.();
        },
        onPanResponderTerminate: () => handlers.current.onCancel?.(),
      }).panHandlers,
    [],
  );
}
