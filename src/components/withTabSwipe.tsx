import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSwipe } from '../hooks/useSwipe';
import { neighborIndex } from '../utils/swipe';

// Параметры движения. Экран не уезжает за край целиком, а смещается на долю ширины и
// гаснет — короче и спокойнее, чем полный "пейджер", и не оставляет пустого места между
// уходящим и приходящим экраном (стандартные нижние вкладки показывают только один).
const TRAVEL = 0.3; // доля ширины экрана
const OUT_MS = 110;
const IN_MS = 230;
const SPRING_BACK_MS = 160;
const DRAG_FOLLOW = 0.55; // насколько экран идёт за пальцем, когда есть куда листать
const MIN_OPACITY = 0.2; // не до нуля: иначе на стыке двух экранов был бы "провал" в пустой фон
const DRAG_RESIST = 0.12; // и насколько, когда дальше некуда (упёрлись в край) — "резинка"

// Откуда пришли — запоминаем на уровне модуля, потому что у каждой вкладки свой
// экземпляр обёртки, а направление въезда определяется парой "из какой — в какую".
let lastFocusedIndex: number | null = null;

/**
 * Оборачивает экран нижней вкладки: свайп влево — следующая вкладка, вправо — предыдущая.
 * Экран идёт за пальцем, при отпускании плавно уезжает, а следующий так же плавно
 * въезжает с противоположной стороны. Въезд работает и для нажатия на вкладку внизу
 * (направление считается по порядку вкладок). Без новых нативных зависимостей: всё на
 * штатном Animated с нативным драйвером, то есть анимация идёт мимо JS-потока и не
 * дёргается, даже если экран в этот момент занят работой.
 */
export function withTabSwipe<P extends object>(Screen: React.ComponentType<P>): React.ComponentType<P> {
  function SwipeableTab(props: P) {
    const navigation = useNavigation<BottomTabNavigationProp<Record<string, undefined>>>();
    const { width } = useWindowDimensions();
    const translateX = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const leaving = useRef(false);

    const animateTo = useCallback(
      (x: number, o: number, duration: number, easing: (t: number) => number, done?: () => void) => {
        Animated.parallel([
          Animated.timing(translateX, { toValue: x, duration, easing, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: o, duration, easing, useNativeDriver: true }),
        ]).start(done ? () => done() : undefined);
      },
      [translateX, opacity],
    );

    const springBack = useCallback(() => {
      animateTo(0, 1, SPRING_BACK_MS, Easing.out(Easing.quad));
    }, [animateTo]);

    // Въезд: вкладка получила фокус — по порядку вкладок понятно, с какой стороны она пришла.
    useEffect(() => {
      const unsubscribeFocus = navigation.addListener('focus', () => {
        const index = navigation.getState().index;
        const previous = lastFocusedIndex;
        lastFocusedIndex = index;
        leaving.current = false;
        if (previous == null || previous === index) return;
        const fromRight = index > previous ? 1 : -1;
        translateX.setValue(fromRight * width * TRAVEL);
        opacity.setValue(MIN_OPACITY);
        animateTo(0, 1, IN_MS, Easing.out(Easing.cubic));
      });
      // Ушедшую вкладку возвращаем в обычное состояние, пока её не видно — иначе при
      // следующем возврате она на миг мелькнула бы прозрачной.
      const unsubscribeBlur = navigation.addListener('blur', () => {
        translateX.setValue(0);
        opacity.setValue(1);
        leaving.current = false; // на случай, если переход по какой-то причине не состоялся
      });
      // Вкладка, которую открыли впервые, могла получить фокус до того, как мы подписались:
      // запоминаем её индекс сразу, иначе направление следующей анимации считалось бы от
      // устаревшей вкладки.
      if (navigation.isFocused()) lastFocusedIndex = navigation.getState().index;
      return () => {
        unsubscribeFocus();
        unsubscribeBlur();
      };
    }, [navigation, width, translateX, opacity, animateTo]);

    const panHandlers = useSwipe(
      (direction) => {
        const state = navigation.getState();
        const target = neighborIndex(state.index, state.routeNames.length, direction);
        if (target == null || leaving.current) {
          springBack(); // дальше некуда — просто возвращаем на место
          return;
        }
        leaving.current = true;
        const sign = direction === 'left' ? -1 : 1; // экран уезжает туда же, куда ушёл палец
        animateTo(sign * width * TRAVEL, MIN_OPACITY, OUT_MS, Easing.in(Easing.quad), () =>
          navigation.navigate(state.routeNames[target]),
        );
      },
      {
        onMove: (dx) => {
          if (leaving.current) return;
          const state = navigation.getState();
          const canGo = neighborIndex(state.index, state.routeNames.length, dx < 0 ? 'left' : 'right') != null;
          translateX.setValue(dx * (canGo ? DRAG_FOLLOW : DRAG_RESIST));
          opacity.setValue(1 - Math.min(Math.abs(dx) / width, 0.5) * (canGo ? 0.8 : 0.2));
        },
        onCancel: springBack,
      },
    );

    return (
      <Animated.View style={{ flex: 1, opacity, transform: [{ translateX }] }} {...panHandlers}>
        <Screen {...props} />
      </Animated.View>
    );
  }
  SwipeableTab.displayName = `withTabSwipe(${Screen.displayName || Screen.name || 'Screen'})`;
  return SwipeableTab;
}
