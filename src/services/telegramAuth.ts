// Полифил crypto.getRandomValues для Hermes — должен быть импортирован до использования.
import 'react-native-get-random-values';
import { Linking } from 'react-native';
import { sha256 } from 'js-sha256';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import { db } from './firebase';
import { TELEGRAM_BOT_USERNAME } from '../config';

const LOGIN_TTL_MS = 10 * 60 * 1000;

/**
 * Криптостойкая случайная строка. Раньше использовался Math.random() — его выход
 * предсказуем и для секретов, дающих вход в аккаунт, не годится.
 */
function secureRandom(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < length; i++) {
    // 256 % 36 != 0 даёт ничтожный перекос распределения — для 32+ символов несущественно.
    s += alphabet[bytes[i] % alphabet.length];
  }
  return s;
}

export interface TelegramLoginSession {
  /** Публичная часть: уходит в ссылку на бота. */
  token: string;
  /** Секретная часть: остаётся на устройстве, в Firestore — только её хэш. */
  secret: string;
}

/** Готовит новую попытку входа и открывает бота с токеном в /start. */
export async function startTelegramLogin(): Promise<TelegramLoginSession> {
  const token = secureRandom(32, 'abcdefghijklmnopqrstuvwxyz0123456789');
  const secret = secureRandom(48, '0123456789abcdef');

  await db.collection('telegram_login_requests').doc(token).set({
    status: 'pending',
    createdAt: firestore.FieldValue.serverTimestamp(),
    expiresAt: firestore.Timestamp.fromMillis(Date.now() + LOGIN_TTL_MS),
    secretHash: sha256(secret),
  });

  await Linking.openURL(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`);
  return { token, secret };
}

export type TelegramLoginOutcome = { status: 'success' } | { status: 'error'; message: string };

/**
 * Слушает свою заявку; как только в боте нажали «Подтвердить» — обменивает токен+секрет
 * на Firebase custom token и входит. Возвращает функцию отписки.
 */
export function watchTelegramLogin(
  session: TelegramLoginSession,
  onOutcome: (o: TelegramLoginOutcome) => void,
): () => void {
  const exchange = functions().httpsCallable('exchangeTelegramLogin');
  let exchanging = false;

  return db
    .collection('telegram_login_requests')
    .doc(session.token)
    .onSnapshot(
      async (doc) => {
        const status = doc.data()?.status;
        if (status === 'rejected') {
          onOutcome({ status: 'error', message: 'Вход отменён в Telegram' });
          return;
        }
        if (status !== 'verified' || exchanging) return;

        exchanging = true;
        try {
          const result = await exchange({ token: session.token, secret: session.secret });
          const { customToken } = result.data as { customToken: string };
          await auth().signInWithCustomToken(customToken);
          // Профиль и гараж заведёт ensureUserBootstrapped (services/firebase.ts) при входе.
          onOutcome({ status: 'success' });
        } catch {
          onOutcome({ status: 'error', message: 'Не удалось завершить вход через Telegram' });
        }
      },
      () => onOutcome({ status: 'error', message: 'Нет соединения' }),
    );
}
