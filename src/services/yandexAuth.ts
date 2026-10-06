import { apiFetch } from './api';
import { completeYandexLogin } from './auth';
import { parseQuery } from '../utils/query';

export interface YandexLoginSession {
  state: string;
  authorizeUrl: string;
  /** Префикс адреса, на который Яндекс вернёт браузер после входа — вытащен из
   *  authorizeUrl (параметр redirect_uri), а не задан отдельной константой на телефоне:
   *  так сервер — единственный источник правды про этот адрес, нечему разъезжаться. */
  redirectPrefix: string;
}

function extractRedirectUri(authorizeUrl: string): string {
  const match = authorizeUrl.match(/[?&]redirect_uri=([^&]+)/);
  if (!match) throw new Error('authorizeUrl без redirect_uri — сервер настроен неверно');
  return decodeURIComponent(match[1]);
}

export async function startYandexLogin(): Promise<YandexLoginSession> {
  const { state, authorizeUrl } = await apiFetch<{ state: string; authorizeUrl: string }>('/v1/yandex/start', {
    method: 'POST',
    auth: false,
  });
  return { state, authorizeUrl, redirectPrefix: extractRedirectUri(authorizeUrl) };
}

export type YandexNavigationResult =
  | { kind: 'redirect'; code: string; state: string }
  | { kind: 'redirect'; error: string }
  | { kind: 'ignore' };

/** Разбирает очередной URL, на который перешёл WebView — решает, наш это редирект или нет. */
export function inspectYandexNavigation(url: string, redirectPrefix: string): YandexNavigationResult {
  if (!url.startsWith(redirectPrefix)) return { kind: 'ignore' };

  const query = url.slice(url.indexOf('?') + 1);
  const params = parseQuery(query); // не URLSearchParams — в React Native у него .get бросает ошибку
  const error = params.error;
  if (error) return { kind: 'redirect', error };

  const code = params.code;
  const state = params.state;
  if (!code || !state) return { kind: 'redirect', error: 'invalid_response' };

  return { kind: 'redirect', code, state };
}

export type YandexLoginOutcome = { status: 'success' } | { status: 'error'; message: string };

export async function finishYandexLogin(code: string, state: string): Promise<YandexLoginOutcome> {
  try {
    await completeYandexLogin(code, state);
    return { status: 'success' };
  } catch {
    return { status: 'error', message: 'Не удалось завершить вход через Яндекс' };
  }
}
