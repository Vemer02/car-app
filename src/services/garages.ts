import firestore from '@react-native-firebase/firestore';
import { authService, db, getGarageId, getOwnGarageId, getUserLabel } from './firebase';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих символов (0/O, 1/I)
const CODE_LENGTH = 6;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export interface JoinRequest {
  id: string;
  garageId: string;
  uid: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

/** Создаёт код приглашения в текущий гараж. Возвращает сам код (показать/поделиться). */
export async function createInviteCode(): Promise<string> {
  const garageId = getGarageId();
  const uid = authService.currentUser?.uid;
  if (!garageId || !uid) throw new Error('Не авторизован');

  // На случай коллизии (маловероятной при 6 символах из 32-символьного алфавита) — пара попыток.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const ref = db.collection('garage_invites').doc(code);
    const existing = await ref.get();
    if (existing.exists) continue;

    await ref.set({
      garageId,
      createdBy: uid,
      createdAt: firestore.FieldValue.serverTimestamp(),
      expiresAt: firestore.Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
    });
    return code;
  }
  throw new Error('Не удалось сгенерировать код, попробуйте ещё раз');
}

export type JoinByCodeResult = 'requested' | 'not_found' | 'expired' | 'already_member' | 'own_garage';

/** Отправляет заявку на вступление в гараж по коду. Само вступление — после одобрения участником. */
export async function joinGarageByCode(code: string): Promise<JoinByCodeResult> {
  const uid = authService.currentUser?.uid;
  if (!uid) throw new Error('Не авторизован');

  const inviteDoc = await db.collection('garage_invites').doc(code.trim().toUpperCase()).get();
  if (!inviteDoc.exists) return 'not_found';

  const invite = inviteDoc.data()!;
  const expiresAtMs = invite.expiresAt?.toMillis?.() ?? 0;
  if (expiresAtMs < Date.now()) return 'expired';

  const garageId = invite.garageId as string;
  if (garageId === uid) return 'own_garage';
  if (garageId === getGarageId()) return 'already_member';

  // Документ чужого гаража НЕ читаем: правила пускают к нему только участников, и раньше
  // эта проверка падала с permission-denied у каждого, кто вступает впервые — то есть
  // вступить по коду было невозможно вообще.

  await db.collection('garage_join_requests').add({
    garageId,
    uid,
    email: getUserLabel(),
    status: 'pending',
    createdAt: firestore.FieldValue.serverTimestamp(),
  });

  return 'requested';
}

/** Живая подписка на входящие заявки в текущий гараж (для владельца/участников). */
export function observeIncomingJoinRequests(
  garageId: string,
  onChange: (requests: JoinRequest[]) => void,
): () => void {
  return db
    .collection('garage_join_requests')
    .where('garageId', '==', garageId)
    .where('status', '==', 'pending')
    .onSnapshot(
      (snap) => {
        const requests: JoinRequest[] = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            garageId: d.garageId,
            uid: d.uid,
            email: d.email,
            status: d.status,
            createdAt: d.createdAt?.toMillis?.() ?? Date.now(),
          };
        });
        onChange(requests);
      },
      () => onChange([]),
    );
}

export async function approveJoinRequest(request: JoinRequest): Promise<void> {
  const batch = db.batch();
  batch.update(db.collection('garages').doc(request.garageId), {
    members: firestore.FieldValue.arrayUnion(request.uid),
    [`memberEmails.${request.uid}`]: request.email,
  });
  batch.update(db.collection('garage_join_requests').doc(request.id), { status: 'approved' });
  await batch.commit();
}

export async function rejectJoinRequest(request: JoinRequest): Promise<void> {
  await db.collection('garage_join_requests').doc(request.id).update({ status: 'rejected' });
}

/**
 * Проверяет, не одобрили ли только что заявку текущего пользователя, и если да —
 * переключает его activeGarageId на новый гараж и убирает завершённую заявку.
 * Вызывать при открытии экрана Гаража (владелец мог одобрить, пока мы были офлайн).
 */
export async function checkOwnApprovedRequests(): Promise<boolean> {
  const uid = authService.currentUser?.uid;
  if (!uid) return false;

  const snap = await db
    .collection('garage_join_requests')
    .where('uid', '==', uid)
    .where('status', '==', 'approved')
    .get();

  if (snap.empty) return false;

  // Переключаем активный гараж. Сброс локальной базы и загрузку данных нового гаража
  // сделает синхронизация сама, заметив, что база привязана к другому гаражу.
  const request = snap.docs[0].data();
  await db.collection('users').doc(uid).set({ activeGarageId: request.garageId }, { merge: true });
  await snap.docs[0].ref.delete();
  return true;
}

export interface GarageMember {
  uid: string;
  email: string;
}

/**
 * Email участников текущего гаража — читаются прямо из garages/{id}.memberEmails,
 * а не из чужих users/{uid} (те по правилам читает только сам владелец документа).
 * memberEmails заполняется при регистрации (свой email) и при одобрении заявки (email заявителя).
 */
export async function fetchGarageMembers(garageId: string): Promise<GarageMember[]> {
  const garageDoc = await db.collection('garages').doc(garageId).get();
  const data = garageDoc.data();
  const members: string[] = data?.members ?? [];
  const emails: Record<string, string> = data?.memberEmails ?? {};
  // `||`, а не `??`: пустая строка (было у входа через Telegram без email) — тоже «нет имени».
  return members.map((uid) => ({ uid, email: emails[uid] || `Пользователь ${uid.slice(0, 6)}` }));
}

/** Правда ли, что активный гараж — не свой собственный, а тот, в который вступили. */
export function isInSharedGarage(activeGarageId: string | null): boolean {
  const own = getOwnGarageId();
  return !!activeGarageId && !!own && activeGarageId !== own;
}

/**
 * Покидает текущий (чужой) гараж: убирает себя из его members/memberEmails и
 * возвращает activeGarageId обратно на свой собственный гараж. Несинхронизированные
 * изменения нужно дослать ДО вызова (после выхода доступа к гаражу уже не будет);
 * локальную базу пересоберёт синхронизация, заметив смену гаража.
 */
export async function leaveGarage(): Promise<void> {
  const uid = authService.currentUser?.uid;
  const garageId = getGarageId();
  const ownGarageId = getOwnGarageId();
  if (!uid || !garageId || !ownGarageId) throw new Error('Не авторизован');
  if (garageId === ownGarageId) throw new Error('Вы уже в своём гараже');

  const batch = db.batch();
  batch.update(db.collection('garages').doc(garageId), {
    members: firestore.FieldValue.arrayRemove(uid),
    [`memberEmails.${uid}`]: firestore.FieldValue.delete(),
  });
  batch.set(db.collection('users').doc(uid), { activeGarageId: firestore.FieldValue.delete() }, { merge: true });
  await batch.commit();
}
