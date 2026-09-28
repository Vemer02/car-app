import { Platform } from 'react-native';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import crashlytics from '@react-native-firebase/crashlytics';
import messaging from '@react-native-firebase/messaging';
import { LEGAL_VERSION } from '../legal/generated';

// @react-native-firebase инициализируется автоматически из android/app/google-services.json —
// отдельный вызов initializeApp() не нужен.

export const authService = auth();
export const db = firestore();
export const crashlyticsService = crashlytics();
export const messagingService = messaging();

export async function requestNotificationPermission(): Promise<boolean> {
  const authStatus = await messagingService.requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

/**
 * Как показывать пользователя другим участникам гаража. У входа через Telegram нет email —
 * там имя приходит как displayName (его выставляет Cloud Function перед выдачей токена).
 */
export function getUserLabel(user: FirebaseAuthTypes.User | null = authService.currentUser): string {
  if (!user) return '';
  return user.email || user.displayName || user.phoneNumber || `Пользователь ${user.uid.slice(0, 6)}`;
}

/**
 * Заводит профиль и собственный гараж пользователя, если их ещё нет. Идемпотентно и
 * вызывается при КАЖДОМ входе (любым способом), а не только при регистрации: если запись
 * сразу после регистрации не прошла (обрыв сети), аккаунт иначе навсегда остался бы без
 * гаража — и ни одна синхронизация не проходила бы правила доступа.
 */
async function ensureUserBootstrapped(user: FirebaseAuthTypes.User): Promise<void> {
  const uid = user.uid;
  const label = getUserLabel(user);

  // Профиль: merge — не затираем activeGarageId и прочие поля, если профиль уже есть.
  await db.collection('users').doc(uid).set({ label, email: user.email ?? null }, { merge: true });

  // Гараж: читаем именно с сервера — «документа нет» из устаревшего кэша привело бы к
  // попытке пересоздать существующий гараж (и затереть список участников).
  const garageRef = db.collection('garages').doc(uid);
  const snap = await garageRef.get({ source: 'server' });
  if (!snap.exists) {
    await garageRef.set({
      ownerId: uid,
      members: [uid],
      memberEmails: { [uid]: label },
      createdAt: firestore.FieldValue.serverTimestamp(),
    });
  }
}

export async function signUp(email: string, password: string) {
  // Профиль и гараж заведёт ensureUserBootstrapped из onAuthStateChanged ниже —
  // один путь для всех способов входа.
  const cred = await authService.createUserWithEmailAndPassword(email, password);
  return cred.user;
}

export async function signIn(email: string, password: string) {
  const cred = await authService.signInWithEmailAndPassword(email, password);
  return cred.user;
}

/** Только выход из Firebase. Из UI вызывать signOutAndClear() из services/session.ts. */
export async function signOut() {
  await authService.signOut();
}

// ---- Активный гараж ------------------------------------------------------
//
// garageId — свой uid (свой гараж) или users/{uid}.activeGarageId, если пользователь
// вступил в чужой. ВАЖНО: пока не пришёл первый снимок users-документа, гараж считается
// НЕИЗВЕСТНЫМ (null), а не «своим» — иначе при холодном старте участник общего гаража
// успевал синхронизироваться со своим личным гаражом и перемешивал данные.

let cachedGarageId: string | null = null;
let unsubscribeUserDoc: (() => void) | null = null;
const garageListeners = new Set<() => void>();

function setCachedGarageId(next: string | null) {
  if (next === cachedGarageId) return;
  cachedGarageId = next;
  garageListeners.forEach((l) => l());
}

// ---- Согласие на обработку персональных данных -----------------------------
//
// 'unknown'  — профиль ещё не загружен (приложение показывает заставку);
// 'required' — согласия нет или оно дано на более раннюю редакцию документов;
// 'accepted' — согласие на текущую редакцию есть.

export type ConsentState = 'unknown' | 'required' | 'accepted';
export type ConsentMethod = 'registration' | 'consent_screen';

let consentState: ConsentState = 'unknown';
let pendingConsentMethod: ConsentMethod | null = null;
let consentFallbackTimer: ReturnType<typeof setTimeout> | null = null;
const consentListeners = new Set<() => void>();

function setConsentState(next: ConsentState) {
  if (next !== 'unknown' && consentFallbackTimer) {
    clearTimeout(consentFallbackTimer);
    consentFallbackTimer = null;
  }
  if (next === consentState) return;
  consentState = next;
  consentListeners.forEach((l) => l());
}

export function getConsentState(): ConsentState {
  return consentState;
}

export function subscribeConsent(listener: () => void): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

/**
 * Галочка согласия уже поставлена на экране регистрации — вызвать ДО регистрации/входа.
 * Тогда после входа согласие запишется автоматически, без повторного экрана согласия.
 * При ошибке или отмене входа — вызвать с null.
 */
export function setPendingConsent(method: ConsentMethod | null) {
  pendingConsentMethod = method;
}

/**
 * Фиксирует согласие: в профиле (текущее состояние) и в журнале users/{uid}/consents,
 * куда можно только дописывать — это доказательство согласия, которое по закону обязан
 * предоставить оператор. Не ждём ответа сервера: без сети запись уйдёт позже, а экран
 * не должен из-за этого зависать.
 */
export function recordPrivacyConsent(method: ConsentMethod): void {
  const uid = authService.currentUser?.uid;
  if (!uid) return;
  const entry = {
    version: LEGAL_VERSION,
    method,
    platform: Platform.OS,
    acceptedAt: firestore.FieldValue.serverTimestamp(),
  };
  const userRef = db.collection('users').doc(uid);
  const batch = db.batch();
  batch.set(userRef, { privacyConsent: entry }, { merge: true });
  batch.set(userRef.collection('consents').doc(), entry);
  batch.commit().catch((err) => console.warn('recordPrivacyConsent failed:', err));
  setConsentState('accepted');
}

function subscribeUserDoc(uid: string) {
  unsubscribeUserDoc?.();
  unsubscribeUserDoc = db
    .collection('users')
    .doc(uid)
    .onSnapshot(
      (doc) => {
        // «Документа нет» из локального кэша без связи с сервером — это не ответ,
        // а отсутствие информации. Ждём сервер, а не делаем выводов.
        if (doc.metadata.fromCache && !doc.exists) return;

        const data = doc.data();
        setCachedGarageId((data?.activeGarageId as string | undefined) ?? uid);

        const accepted = (data?.privacyConsent?.version ?? 0) >= LEGAL_VERSION;
        const pending = pendingConsentMethod;
        pendingConsentMethod = null;
        if (!accepted && pending) {
          recordPrivacyConsent(pending);
          return;
        }
        setConsentState(accepted ? 'accepted' : 'required');
      },
      (err) => {
        // Гараж оставляем неизвестным: синхронизация не пойдёт «наугад» не в тот гараж.
        console.warn('users doc listener failed:', err);
        if (consentState === 'unknown') setConsentState('required');
      },
    );
}

function watchUserDoc(uid: string) {
  setCachedGarageId(null);
  setConsentState('unknown');
  // Страховка от вечной заставки: если профиль не загрузился (нет сети и нет кэша),
  // через 8 секунд просим согласие — ответ сохранится локально и уйдёт при появлении сети.
  if (consentFallbackTimer) clearTimeout(consentFallbackTimer);
  consentFallbackTimer = setTimeout(() => {
    consentFallbackTimer = null;
    if (consentState === 'unknown') setConsentState('required');
  }, 8000);
  subscribeUserDoc(uid);
}

/**
 * На время удаления аккаунта отписываемся от профиля: сервер сотрёт документ раньше, чем
 * мы успеем выйти, и приложение приняло бы это за «согласия нет» — на секунду показав экран согласия.
 */
export function pauseUserDocWatch() {
  unsubscribeUserDoc?.();
  unsubscribeUserDoc = null;
}

/** Вернуть подписку, если удаление не удалось и пользователь остаётся в приложении. */
export function resumeUserDocWatch() {
  const uid = authService.currentUser?.uid;
  if (uid && !unsubscribeUserDoc) subscribeUserDoc(uid);
}

authService.onAuthStateChanged((user) => {
  if (user) {
    watchUserDoc(user.uid);
    ensureUserBootstrapped(user).catch((err) => {
      // Офлайн — не страшно: повторим при следующем входе/запуске.
      console.warn('ensureUserBootstrapped failed (will retry next launch):', err);
    });
  } else {
    unsubscribeUserDoc?.();
    unsubscribeUserDoc = null;
    pendingConsentMethod = null;
    if (consentFallbackTimer) clearTimeout(consentFallbackTimer);
    consentFallbackTimer = null;
    setCachedGarageId(null);
    setConsentState('unknown');
  }
});

/** Текущий активный гараж (свой или тот, в который вступили). null — не вошли или ещё не известен. */
export function getGarageId(): string | null {
  return cachedGarageId;
}

/** Свой собственный гараж (id всегда = свой uid). */
export function getOwnGarageId(): string | null {
  return authService.currentUser?.uid ?? null;
}

/** Подписка на смену активного гаража (для useSyncExternalStore и фоновой синхронизации). */
export function subscribeActiveGarage(listener: () => void): () => void {
  garageListeners.add(listener);
  return () => {
    garageListeners.delete(listener);
  };
}
