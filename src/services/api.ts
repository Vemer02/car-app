import * as Keychain from 'react-native-keychain';
import { API_BASE_URL } from '../config';

// Отдельный "сервис" в Keychain от замка биометрии (services/biometrics.ts) — это два
// независимых секрета с разным временем жизни, их не стоит путать в одной записи.
const TOKENS_SERVICE = 'com.carapp.auth_tokens';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

// Access-токен живёт в памяти процесса, чтобы не лезть в Keychain на каждый запрос —
// туда же он проваливается заново из Keychain при холодном старте (loadTokens()).
let memoryAccessToken: string | null = null;

async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const result = await Keychain.getGenericPassword({ service: TOKENS_SERVICE });
    if (!result) return null;
    return JSON.parse(result.password) as StoredTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  memoryAccessToken = tokens.accessToken;
  await Keychain.setGenericPassword('tokens', JSON.stringify(tokens), { service: TOKENS_SERVICE });
}

export async function clearTokens(): Promise<void> {
  memoryAccessToken = null;
  await Keychain.resetGenericPassword({ service: TOKENS_SERVICE }).catch(() => {});
}

export async function getStoredRefreshToken(): Promise<string | null> {
  const tokens = await loadTokens();
  return tokens?.refreshToken ?? null;
}

async function getAccessToken(): Promise<string | null> {
  if (memoryAccessToken) return memoryAccessToken;
  const tokens = await loadTokens();
  memoryAccessToken = tokens?.accessToken ?? null;
  return memoryAccessToken;
}

// Сервер отзывает ВСЮ цепочку токенов при повторном использовании уже обменянного
// refresh-токена (см. auth.js на сервере — это защита от кражи). Если два запроса
// одновременно получат 401 и оба независимо дёрнут /auth/refresh одним и тем же
// refreshToken, второй вызов попадёт ровно в эту защиту и разлогинит пользователя.
// Поэтому обновление токена всегда только одно "в полёте" — остальные ждут его результат.
let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens?.refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) {
      // Токен реально недействителен (истёк/отозван) — по сети точно узнали, значит,
      // сессию отовсюду разумно считать закрытой и чистить и локальное хранилище.
      await clearTokens();
      return null;
    }
    const data = await res.json();
    await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  } catch {
    // Сетевая ошибка — не разлогиниваем: возможно, просто нет связи, токен ещё жив.
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** true — сетевая ошибка (нет связи с сервером), а не ответ сервера с ошибкой. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError; // именно так `fetch` сообщает об обрыве соединения
}

interface RequestOptions extends RequestInit {
  /** false — не добавлять Authorization и не пытаться обновить токен при 401 (вход/регистрация). */
  auth?: boolean;
}

/** Бинарный ответ (фото) — с той же авторизацией и обновлением токена, что и у apiFetch. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const doFetch = async () => {
    const token = await getAccessToken();
    return fetch(`${API_BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  let res = await doFetch();
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await doFetch();
  }
  if (!res.ok) throw new ApiError(res.status, 'photo_fetch_failed', 'Не удалось загрузить фото');
  return res.blob();
}

export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json', ...(headers as any) };
    if (auth) {
      const token = await getAccessToken();
      if (token) h.Authorization = `Bearer ${token}`;
    }
    return h;
  };

  let res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: await buildHeaders() });

  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: await buildHeaders() });
    }
  }

  if (res.status === 204) return null as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'unknown_error', data?.error?.message ?? 'Ошибка сервера');
  }
  return data as T;
}
