import { apiFetch, saveTokens, clearTokens, getStoredRefreshToken, ApiError, isNetworkError } from './api';
import { LEGAL_VERSION } from '../legal/generated';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface Profile extends AuthUser {
  activeGarageId: string | null;
  ownGarageId: string | null;
  consentVersion: number | null;
  consentMethod: string | null;
  consentAt: string | null;
  switchedGarage: boolean;
}

// ---- Состояние сессии -------------------------------------------------------------
//
// 'unknown' — ещё выясняем (идёт bootstrap при холодном старте);
// 'authenticated' / 'unauthenticated' — как и звучит.

export type AuthState = 'unknown' | 'authenticated' | 'unauthenticated';
export type ConsentState = 'unknown' | 'required' | 'accepted';

let authState: AuthState = 'unknown';
let consentState: ConsentState = 'unknown';
let cachedGarageId: string | null = null;
let cachedOwnGarageId: string | null = null;
let cachedUserId: string | null = null;

const authListeners = new Set<() => void>();
const consentListeners = new Set<() => void>();
const garageListeners = new Set<() => void>();

function setAuthState(next: AuthState) {
  if (next === authState) return;
  authState = next;
  authListeners.forEach((l) => l());
}
function setConsentState(next: ConsentState) {
  if (next === consentState) return;
  consentState = next;
  consentListeners.forEach((l) => l());
}
function setGarageId(next: string | null) {
  if (next === cachedGarageId) return;
  cachedGarageId = next;
  garageListeners.forEach((l) => l());
}

export const getAuthState = () => authState;
export const getConsentState = () => consentState;
export const getGarageId = () => cachedGarageId;
export const getOwnGarageId = () => cachedOwnGarageId;
export const getCurrentUserId = () => cachedUserId;

export const subscribeAuthState = (listener: () => void) => {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
};
export const subscribeConsent = (listener: () => void) => {
  consentListeners.add(listener);
  return () => { consentListeners.delete(listener); };
};
export const subscribeActiveGarage = (listener: () => void) => {
  garageListeners.add(listener);
  return () => { garageListeners.delete(listener); };
};

function applyProfile(profile: Profile) {
  cachedUserId = profile.id;
  cachedOwnGarageId = profile.ownGarageId;
  setGarageId(profile.activeGarageId);
  const accepted = (profile.consentVersion ?? 0) >= LEGAL_VERSION;
  setConsentState(accepted ? 'accepted' : 'required');
}

function resetSessionState() {
  cachedUserId = null;
  cachedOwnGarageId = null;
  setGarageId(null);
  setConsentState('unknown');
}

/** Перечитывает профиль с сервера. Возвращает его же — например, чтобы узнать switchedGarage. */
export async function refreshProfile(): Promise<Profile> {
  const profile = await apiFetch<Profile>('/v1/me');
  applyProfile(profile);
  return profile;
}

/** Вызвать один раз при старте приложения — решает, авторизован ли пользователь. */
export async function bootstrapSession(): Promise<void> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) {
    setAuthState('unauthenticated');
    return;
  }
  try {
    await refreshProfile();
    setAuthState('authenticated');
  } catch {
    // Токен недействителен даже после попытки обновления (api.ts делает это сама) —
    // либо нет сети совсем. Разграничивать не пытаемся: без профиля показывать нечего.
    setAuthState('unauthenticated');
  }
}

export async function signUp(email: string, password: string): Promise<void> {
  const data = await apiFetch<{ user: AuthUser; accessToken: string; refreshToken: string }>('/v1/auth/register', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  cachedUserId = data.user.id;
  setAuthState('authenticated');
  // Согласие в этом же действии регистрации фиксирует экран регистрации (recordConsent) —
  // явным отдельным шагом сразу после этого вызова, а не автоматически здесь.
}

export async function signIn(email: string, password: string): Promise<void> {
  const data = await apiFetch<{ user: AuthUser; accessToken: string; refreshToken: string }>('/v1/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  cachedUserId = data.user.id;
  setAuthState('authenticated');
  await refreshProfile().catch(() => {}); // подтянуть consent/гараж; не критично, если офлайн
}

/** Только выход из аккаунта. Из UI обычно нужен signOutAndClear() из services/session.ts. */
export async function signOut(): Promise<void> {
  const refreshToken = await getStoredRefreshToken();
  if (refreshToken) {
    await apiFetch('/v1/auth/logout', { method: 'POST', auth: false, body: JSON.stringify({ refreshToken }) }).catch(
      () => {}, // офлайн — не страшно, локальную сессию всё равно чистим ниже
    );
  }
  await clearTokens();
  resetSessionState();
  setAuthState('unauthenticated');
}

export type ConsentMethod = 'registration' | 'consent_screen';

export async function recordConsent(method: ConsentMethod): Promise<void> {
  await apiFetch('/v1/consent', {
    method: 'POST',
    body: JSON.stringify({ version: LEGAL_VERSION, method }),
  });
  setConsentState('accepted');
}

/** Человеко-понятное сообщение об ошибке входа/регистрации. */
export function describeAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'invalid_email':
        return 'Некорректный email';
      case 'weak_password':
        return 'Пароль должен быть не короче 8 символов';
      case 'email_taken':
        return 'Этот email уже зарегистрирован';
      case 'invalid_credentials':
        return 'Неверный email или пароль';
      case 'too_many_attempts':
        return err.message; // сервер сам говорит, сколько ждать
      default:
        return 'Не удалось выполнить запрос. Попробуйте ещё раз';
    }
  }
  if (isNetworkError(err)) return 'Нет соединения с сервером';
  return 'Не удалось выполнить запрос. Попробуйте ещё раз';
}
