import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSwipe } from '../hooks/useSwipe';
import { neighborIndex } from '../utils/swipe';

/**
 * Оборачивает экран нижней вкладки: свайп влево — следующая вкладка, вправо — предыдущая.
 * Без новых нативных зависимостей (стандартные нижние вкладки React Navigation сами свайп
 * не умеют). Листает по порядку вкладок, без зацикливания: с последней дальше некуда.
 */
export function withTabSwipe<P extends object>(Screen: React.ComponentType<P>): React.ComponentType<P> {
  function SwipeableTab(props: P) {
    const navigation = useNavigation<BottomTabNavigationProp<Record<string, undefined>>>();
    const panHandlers = useSwipe((direction) => {
      const state = navigation.getState();
      const target = neighborIndex(state.index, state.routeNames.length, direction);
      if (target != null) navigation.navigate(state.routeNames[target]);
    });
    return (
      <View style={{ flex: 1 }} {...panHandlers}>
        <Screen {...props} />
      </View>
    );
  }
  SwipeableTab.displayName = `withTabSwipe(${Screen.displayName || Screen.name || 'Screen'})`;
  return SwipeableTab;
}
