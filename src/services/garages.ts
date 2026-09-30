import { apiFetch } from './api';
import { getOwnGarageId, refreshProfile } from './auth';

export interface JoinRequest {
  id: string;
  uid: string;
  email: string;
  createdAt: number;
}

export interface GarageMember {
  uid: string;
  email: string;
}

export type JoinByCodeResult = 'requested' | 'not_found' | 'expired' | 'already_member' | 'own_garage';

/** Создаёт код приглашения в текущий гараж. */
export async function createInviteCode(): Promise<string> {
  const { code } = await apiFetch<{ code: string; expiresAt: string }>('/v1/garages/invite', { method: 'POST' });
  return code;
}

/** Отправляет заявку на вступление в гараж по коду. Само вступление — после одобрения участником. */
export async function joinGarageByCode(code: string): Promise<JoinByCodeResult> {
  const { status } = await apiFetch<{ status: JoinByCodeResult }>('/v1/garages/join', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });
  return status;
}

/**
 * Заявки на вступление в текущий гараж. В отличие от прежней версии на Firestore это
 * не живая подписка, а разовый запрос — вызывайте при открытии экрана и по pull-to-refresh.
 */
export async function fetchPendingRequests(): Promise<JoinRequest[]> {
  const rows = await apiFetch<{ id: string; userId: string; email: string; createdAt: string }[]>(
    '/v1/garages/requests',
  );
  return rows.map((r) => ({ id: r.id, uid: r.userId, email: r.email, createdAt: Date.parse(r.createdAt) }));
}

export async function approveJoinRequest(request: JoinRequest): Promise<void> {
  await apiFetch(`/v1/garages/requests/${request.id}/approve`, { method: 'POST' });
}

export async function rejectJoinRequest(request: JoinRequest): Promise<void> {
  await apiFetch(`/v1/garages/requests/${request.id}/reject`, { method: 'POST' });
}

/**
 * Проверяет, не одобрили ли заявку текущего пользователя — сервер применяет это сам при
 * каждом обращении к /v1/me (см. services/auth.ts). Вызывать при открытии экрана Гаража.
 * Возвращает true, если гараж действительно переключился.
 */
export async function checkOwnApprovedRequests(): Promise<boolean> {
  const profile = await refreshProfile();
  return profile.switchedGarage;
}

export async function fetchGarageMembers(): Promise<GarageMember[]> {
  const rows = await apiFetch<{ id: string; email: string }[]>('/v1/garages/members');
  return rows.map((r) => ({ uid: r.id, email: r.email }));
}

/**
 * Правда ли, что активный гараж — не свой собственный, а тот, в который вступили.
 * ownGarageId сервер отдаёт отдельным полем (см. GET /v1/me) именно для этого сравнения:
 * в отличие от прежней схемы на Firebase, id гаража никак не связан с id пользователя.
 */
export function isInSharedGarage(activeGarageId: string | null): boolean {
  const own = getOwnGarageId();
  return !!activeGarageId && !!own && activeGarageId !== own;
}

/**
 * Покидает текущий (чужой) гараж — возвращает пользователя в его собственный.
 * Несинхронизированные изменения нужно дослать ДО вызова (после выхода доступа к
 * гаражу уже не будет); локальную базу пересоберёт синхронизация, заметив смену гаража.
 */
export async function leaveGarage(): Promise<void> {
  await apiFetch('/v1/garages/leave', { method: 'POST' });
  await refreshProfile(); // подтянуть activeGarageId обратно на свой гараж
}
