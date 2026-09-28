/**
 * Полное удаление данных пользователя. Вынесено из index.js с внедрением зависимостей,
 * чтобы разрушительную логику можно было проверить тестом на «фальшивом» Firestore
 * (см. test/accountDeletion.test.js), а не только на живом проекте.
 *
 * Порядок важен: аккаунт входа (Auth) удаляется ПОСЛЕДНИМ. Если что-то упало посередине,
 * пользователь остаётся с рабочим входом и может повторить удаление — все шаги идемпотентны.
 */

const BATCH_SIZE = 400; // лимит батча Firestore — 500 операций, берём с запасом

/** Удаляет всё, что вернул запрос, пачками. Возвращает количество удалённых документов. */
async function deleteByQuery(db, query) {
  let total = 0;
  for (;;) {
    const snap = await query.limit(BATCH_SIZE).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    total += snap.docs.length;
  }
}

async function deleteAccountData({ db, auth, FieldValue, uid }) {
  const report = { removedFromGarages: 0, detachedMembers: 0, deletedDocs: 0 };

  // 1. Выйти из ЧУЖИХ гаражей, в которых состоим (не только из активного: заявку могли
  //    одобрить, а activeGarageId ещё не переключился). Данные гаража остаются его участникам.
  const memberOf = await db.collection('garages').where('members', 'array-contains', uid).get();
  for (const garage of memberOf.docs) {
    if (garage.id === uid) continue; // свой гараж — ниже
    await garage.ref.update({
      members: FieldValue.arrayRemove(uid),
      [`memberEmails.${uid}`]: FieldValue.delete(),
    });
    report.removedFromGarages++;
  }

  // 2. Свой гараж. Другие его участники теряют общие данные (они принадлежат гаражу владельца),
  //    поэтому сначала возвращаем их в собственные гаражи — иначе их приложение продолжало бы
  //    стучаться в несуществующий гараж.
  const ownGarageRef = db.collection('garages').doc(uid);
  const ownGarage = await ownGarageRef.get();
  if (ownGarage.exists) {
    const members = ownGarage.data().members || [];
    for (const memberUid of members) {
      if (memberUid === uid) continue;
      await db
        .collection('users')
        .doc(memberUid)
        .set({ activeGarageId: FieldValue.delete() }, { merge: true });
      report.detachedMembers++;
    }
  }

  // 3. Все данные своего гаража, включая «надгробия» (deletedAt) — в них тоже лежит garageId.
  for (const collection of ['cars', 'service_records', 'expenses', 'reminders']) {
    report.deletedDocs += await deleteByQuery(db, db.collection(collection).where('garageId', '==', uid));
  }
  report.deletedDocs += await deleteByQuery(db, db.collection('garage_invites').where('garageId', '==', uid));
  report.deletedDocs += await deleteByQuery(db, db.collection('garage_join_requests').where('garageId', '==', uid));
  if (ownGarage.exists) {
    await ownGarageRef.delete();
    report.deletedDocs++;
  }

  // 4. То, что создали мы сами в чужих гаражах: свои приглашения и свои заявки на вступление.
  report.deletedDocs += await deleteByQuery(db, db.collection('garage_invites').where('createdBy', '==', uid));
  report.deletedDocs += await deleteByQuery(db, db.collection('garage_join_requests').where('uid', '==', uid));

  // 5. Служебные заявки входа через Telegram (id и имя лежат там до конца жизни заявки).
  if (uid.startsWith('telegram:')) {
    const telegramId = uid.slice('telegram:'.length);
    report.deletedDocs += await deleteByQuery(
      db,
      db.collection('telegram_login_requests').where('telegramUserId', '==', telegramId),
    );
  }

  // 6. Профиль вместе с подколлекцией журнала согласий.
  await db.recursiveDelete(db.collection('users').doc(uid));

  // 7. Учётная запись входа — последней.
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }

  return report;
}

module.exports = { deleteAccountData, deleteByQuery };
