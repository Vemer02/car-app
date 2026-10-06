import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import { isHorizontalDrag, swipeDirection, type SwipeDirection } from '../utils/swipe';

/**
 * Свайп влево/вправо для любого View: `<View {...useSwipe(cb)}>`.
 * Жест забирается только когда он явно горизонтальный — вертикальная прокрутка и
 * обычные нажатия не страдают. Вложенный View со своим useSwipe выигрывает у внешнего
 * (при согласовании жеста первым спрашивают самый вложенный) — на этом держится
 * "смена машины свайпом по пробегу внутри экрана, который сам листается свайпом".
 */
export function useSwipe(onSwipe: (direction: SwipeDirection) => void) {
  // Свежий колбэк без пересоздания PanResponder на каждый рендер.
  const handler = useRef(onSwipe);
  handler.current = onSwipe;

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => isHorizontalDrag(g.dx, g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          const direction = swipeDirection(g.dx, g.dy, g.vx);
          if (direction) handler.current(direction);
        },
      }).panHandlers,
    [],
  );
}
