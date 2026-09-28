const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { deleteAccountData } = require('./accountDeletion');

admin.initializeApp();
const db = admin.firestore();

// Задать один раз: firebase functions:secrets:set TELEGRAM_BOT_TOKEN
//                   firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_WEBHOOK_SECRET = defineSecret('TELEGRAM_WEBHOOK_SECRET');

const TOKEN_RE = /^[a-z0-9]{32}$/;

async function tg(method, payload) {
  // В Node 20 fetch встроен — отдельная зависимость не нужна.
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.warn(`Telegram ${method} failed:`, res.status, await res.text());
}

function isExpired(data) {
  const expiresAt = data.expiresAt?.toMillis?.() ?? 0;
  return expiresAt < Date.now();
}

/**
 * Вебхук бота (регистрируется один раз через setWebhook — см. README).
 * 1) "/start <токен>" — НЕ подтверждает вход сразу, а спрашивает кнопкой: ссылку на вход
 *    могут прислать и мошенники («нажми, там интересное»), и одно нажатие Start не должно
 *    отдавать аккаунт.
 * 2) нажатие «Подтвердить» — помечает заявку подтверждённой этим Telegram-пользователем.
 */
exports.telegramWebhook = onRequest(
  { secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET] },
  async (req, res) => {
    // Telegram присылает этот заголовок, только если он совпадает с secret_token из
    // setWebhook — так отсекаем чужие запросы на этот URL.
    if (req.get('X-Telegram-Bot-Api-Secret-Token') !== TELEGRAM_WEBHOOK_SECRET.value()) {
      res.status(401).send('unauthorized');
      return;
    }

    const message = req.body?.message;
    const callback = req.body?.callback_query;

    if (message?.text && message.chat?.id) {
      const match = message.text.match(/^\/start(?:\s+(\S+))?/);
      if (match) {
        const token = match[1];
        if (!token) {
          await tg('sendMessage', {
            chat_id: message.chat.id,
            text: 'Это бот входа в приложение «Автолюбитель». Нажмите «Войти через Telegram» в приложении.',
          });
        } else {
          const snap = TOKEN_RE.test(token)
            ? await db.collection('telegram_login_requests').doc(token).get()
            : null;
          if (snap?.exists && snap.data().status === 'pending' && !isExpired(snap.data())) {
            await tg('sendMessage', {
              chat_id: message.chat.id,
              text:
                'Подтвердить вход в приложение «Автолюбитель» с вашим Telegram-аккаунтом?\n\n' +
                'Если вы сейчас НЕ входили в приложение сами — нажмите «Отмена»: кто-то пытается ' +
                'получить доступ к вашему аккаунту.',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Подтвердить вход', callback_data: `ok:${token}` },
                    { text: 'Отмена', callback_data: `no:${token}` },
                  ],
                ],
              },
            });
          } else {
            await tg('sendMessage', {
              chat_id: message.chat.id,
              text: 'Эта ссылка для входа уже не действует. Начните вход заново в приложении.',
            });
          }
        }
      }
    }

    if (callback?.data && callback.message) {
      const [action, token] = String(callback.data).split(':');
      const chatId = callback.message.chat.id;
      const messageId = callback.message.message_id;
      let resultText = 'Эта ссылка для входа уже не действует. Начните вход заново в приложении.';

      if (TOKEN_RE.test(token || '')) {
        const ref = db.collection('telegram_login_requests').doc(token);
        resultText = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists || snap.data().status !== 'pending' || isExpired(snap.data())) {
            return resultText;
          }
          if (action === 'ok') {
            tx.update(ref, {
              status: 'verified',
              telegramUserId: String(callback.from.id),
              telegramUsername: callback.from.username ?? null,
              telegramFirstName: callback.from.first_name ?? null,
              verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return '✅ Вход подтверждён. Вернитесь в приложение — всё уже открылось.';
          }
          tx.update(ref, { status: 'rejected' });
          return 'Вход отменён.';
        });
      }

      await tg('answerCallbackQuery', { callback_query_id: callback.id });
      await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: resultText });
    }

    res.status(200).send('ok');
  },
);

/**
 * Приложение вызывает это, увидев status === 'verified' у своей заявки. Помимо токена
 * требуется секрет, который знает только устройство, начавшее вход (в Firestore лежит
 * лишь его хэш) — поэтому токен из ссылки сам по себе бесполезен. Обмен одноразовый
 * (транзакция), с ограниченным сроком жизни.
 * uid детерминирован по Telegram id: один и тот же человек всегда получает один аккаунт.
 */
exports.exchangeTelegramLogin = onCall(async (request) => {
  const { token, secret } = request.data ?? {};
  if (typeof token !== 'string' || !TOKEN_RE.test(token) || typeof secret !== 'string' || secret.length < 32) {
    throw new HttpsError('invalid-argument', 'invalid-request');
  }

  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
  const ref = db.collection('telegram_login_requests').doc(token);

  const data = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'not-found');
    const d = snap.data();
    if (d.secretHash !== secretHash) throw new HttpsError('permission-denied', 'bad-secret');
    if (d.status !== 'verified') throw new HttpsError('failed-precondition', 'not-verified');
    if (isExpired(d)) throw new HttpsError('deadline-exceeded', 'expired');
    // Персональные данные Telegram (id, username, имя) нужны только для выдачи токена —
    // стираем их из заявки в той же транзакции, а не оставляем до автоудаления по TTL.
    tx.update(ref, {
      status: 'consumed',
      telegramUserId: admin.firestore.FieldValue.delete(),
      telegramUsername: admin.firestore.FieldValue.delete(),
      telegramFirstName: admin.firestore.FieldValue.delete(),
    });
    return d;
  });

  const uid = `telegram:${data.telegramUserId}`;
  const label = data.telegramUsername ? `@${data.telegramUsername}` : data.telegramFirstName || `Telegram ${data.telegramUserId}`;

  // Имя выставляем в самом аккаунте ДО выдачи токена: тогда приложение сразу видит его
  // как displayName и показывает участникам гаража, а не пустую строку.
  try {
    await admin.auth().updateUser(uid, { displayName: label });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await admin.auth().createUser({ uid, displayName: label });
    } else {
      throw err;
    }
  }

  const customToken = await admin.auth().createCustomToken(uid);
  return { customToken };
});

/**
 * Удаление аккаунта самим пользователем («Гараж» → «Удалить аккаунт»). Работает через Admin SDK,
 * поэтому не упирается в требование «недавнего входа» и правила доступа. Вся логика — в
 * accountDeletion.js (покрыта тестами).
 */
exports.deleteMyAccount = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');

  const report = await deleteAccountData({
    db,
    auth: admin.auth(),
    FieldValue: admin.firestore.FieldValue,
    uid,
  });
  console.info('Account deleted', { removedFromGarages: report.removedFromGarages, detachedMembers: report.detachedMembers, deletedDocs: report.deletedDocs });
  return { ok: true };
});
