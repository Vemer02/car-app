import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StatusBar, AppState, AppStateStatus, View } from 'react-native';
import {
  getAuthState,
  subscribeAuthState,
  bootstrapSession,
  subscribeActiveGarage,
  subscribeConsent,
  getConsentState,
} from './src/services/auth';
import { RootNavigator } from './src/navigation';
import { ActiveCarProvider } from './src/context/ActiveCarContext';
import { startBackgroundSync, syncNow } from './src/db/sync';
import { isBiometricLockEnabled, verifyBiometric } from './src/services/biometrics';
import {
  subscribeLocalDataPhase,
  getLocalDataPhase,
  acknowledgeDataUiUnmounted,
} from './src/services/localData';
import BiometricLockScreen from './src/components/BiometricLockScreen';
import { darkTheme } from './src/theme/tokens';

function Splash() {
  return <View style={{ flex: 1, backgroundColor: darkTheme.background }} />;
}

export default function App() {
  const authState = useSyncExternalStore(subscribeAuthState, getAuthState);
  const isAuthenticated = authState === 'authenticated';

  // Замок по биометрии. lockChecked — выяснили ли уже, включён ли замок: пока нет,
  // ничего не показываем (раньше данные успевали мелькнуть до появления замка).
  const [lockChecked, setLockChecked] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [unlockFailed, setUnlockFailed] = useState(false);
  const unlockInProgress = useRef(false);
  const wentToBackground = useRef(false);

  // Фаза локальной базы: на время её сброса дерево с подписками на базу размонтируется.
  const dataPhase = useSyncExternalStore(subscribeLocalDataPhase, getLocalDataPhase);

  // Согласие на обработку ПД для активного профиля (загружается вместе с ним при входе).
  const consentState = useSyncExternalStore(subscribeConsent, getConsentState);

  // Один раз при холодном старте: есть ли сохранённая сессия, действительна ли она.
  useEffect(() => {
    bootstrapSession();
  }, []);

  // Синхронизация — только после явного согласия на обработку данных, не просто после
  // входа: до согласия в облако не должны уходить ни личные данные, ни сами автомобили.
  const canSync = isAuthenticated && consentState === 'accepted';

  useEffect(() => {
    if (!canSync) return;
    return startBackgroundSync();
  }, [canSync]);

  // Активный гараж стал известен или сменился (вступили/вышли, в т.ч. на другом своём
  // устройстве) — синхронизируемся сразу, не дожидаясь минутного таймера.
  useEffect(() => {
    if (!canSync) return;
    return subscribeActiveGarage(() => {
      syncNow();
    });
  }, [canSync]);

  // Дерево с подписками размонтировано (эффекты-очистки дочерних компонентов уже отработали
  // к моменту этого эффекта) — можно безопасно сбрасывать базу.
  useEffect(() => {
    if (dataPhase === 'resetting') acknowledgeDataUiUnmounted();
  }, [dataPhase]);

  async function attemptUnlock() {
    if (unlockInProgress.current) return;
    unlockInProgress.current = true;
    setUnlockFailed(false);
    try {
      const ok = await verifyBiometric();
      setLocked(!ok);
      setUnlockFailed(!ok);
    } finally {
      unlockInProgress.current = false;
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setLockEnabled(false);
      setLocked(false);
      setLockChecked(true);
      return;
    }
    let mounted = true;
    setLockChecked(false);
    isBiometricLockEnabled().then((enabled) => {
      if (!mounted) return;
      setLockEnabled(enabled);
      setLocked(enabled);
      setLockChecked(true);
      if (enabled) attemptUnlock();
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Пока неясно, дано ли согласие на текущую редакцию документов, держим заставку —
  // иначе экран согласия мигал бы поверх уже открытых данных на каждый холодный старт.
  const consentChecked = consentState !== 'unknown';

  // Перезапрашиваем биометрию только после настоящего ухода в фон. Состояние 'inactive'
  // не считаем: сам системный диалог Face ID на iOS переводит приложение в inactive —
  // иначе после каждой успешной разблокировки тут же запрашивалась бы новая.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' && !unlockInProgress.current) {
        wentToBackground.current = true;
      }
      if (next === 'active' && wentToBackground.current) {
        wentToBackground.current = false;
        if (lockEnabled) {
          setLocked(true);
          attemptUnlock();
        }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockEnabled]);

  const statusBar = <StatusBar barStyle="light-content" backgroundColor={darkTheme.background} />;

  if (
    authState === 'unknown' ||
    (isAuthenticated && (!lockChecked || !consentChecked)) ||
    dataPhase === 'resetting'
  ) {
    return (
      <>
        {statusBar}
        <Splash />
      </>
    );
  }

  if (isAuthenticated && locked && consentState === 'accepted') {
    return (
      <>
        {statusBar}
        <BiometricLockScreen onRetry={attemptUnlock} failed={unlockFailed} />
      </>
    );
  }

  return (
    <>
      {statusBar}
      <ActiveCarProvider>
        <RootNavigator isAuthenticated={isAuthenticated} consentRequired={consentState === 'required'} />
      </ActiveCarProvider>
    </>
  );
}
