import { useSyncExternalStore } from 'react';
import { getGarageId, subscribeActiveGarage } from '../services/firebase';

/**
 * Активный гараж как реактивное значение: экран перерисуется, когда пользователь вступит
 * в общий гараж или выйдет из него. Раньше экраны читали getGarageId() один раз при
 * рендере и продолжали работать со старым гаражом после переключения.
 */
export function useActiveGarageId(): string | null {
  return useSyncExternalStore(subscribeActiveGarage, getGarageId);
}
