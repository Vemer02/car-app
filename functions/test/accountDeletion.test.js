const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteAccountData } = require('../accountDeletion');

// ---- Минимальный Firestore в памяти: ровно столько, сколько нужно удалению ----------

const FieldValue = {
  arrayRemove: (v) => ({ __op: 'arrayRemove', v }),
  delete: () => ({ __op: 'delete' }),
};

function createFakeDb(initial) {
  const store = new Map(); // "коллекция/id" -> данные
  for (const [path, data] of Object.entries(initial)) store.set(path, structuredClone(data));

  const refOf = (path) => {
    const [collection, id] = [path.slice(0, path.indexOf('/')), path.slice(path.indexOf('/') + 1)];
    return {
      path,
      id,
      async get() {
        return { exists: store.has(path), id, data: () => store.get(path) };
      },
      async set(data, opts) {
        const base = opts?.merge && store.has(path) ? store.get(path) : {};
        const next = { ...base };
        for (const [k, v] of Object.entries(data)) {
          if (v && v.__op === 'delete') delete next[k];
          else next[k] = v;
        }
        store.set(path, next);
      },
      async update(patch) {
        if (!store.has(path)) throw new Error(`NOT_FOUND ${path}`);
        const doc = structuredClone(store.get(path));
        for (const [key, v] of Object.entries(patch)) {
          const [head, tail] = key.split('.');
          if (v && v.__op === 'arrayRemove') doc[key] = (doc[key] || []).filter((x) => x !== v.v);
          else if (v && v.__op === 'delete') tail ? delete doc[head][tail] : delete doc[key];
          else doc[key] = v;
        }
        store.set(path, doc);
      },
      async delete() {
        store.delete(path);
      },
    };
  };

  const query = (collection, filters, max) => ({
    where: (field, op, value) => query(collection, [...filters, { field, op, value }], max),
    limit: (n) => query(collection, filters, n),
    async get() {
      const docs = [];
      for (const [path, data] of store) {
        if (!path.startsWith(`${collection}/`)) continue;
        const ok = filters.every(({ field, op, value }) => {
          if (op === '==') return data[field] === value;
          if (op === 'array-contains') return Array.isArray(data[field]) && data[field].includes(value);
          throw new Error(`fake Firestore: оператор ${op} не поддерживается`);
        });
        if (ok) docs.push({ id: path.split('/')[1], ref: refOf(path), data: () => data });
      }
      const limited = max ? docs.slice(0, max) : docs;
      return { empty: limited.length === 0, docs: limited };
    },
  });

  return {
    store,
    order: [],
    collection: (name) => ({ ...query(name, [], null), doc: (id) => refOf(`${name}/${id}`) }),
    batch() {
      const ops = [];
      return {
        delete: (ref) => ops.push(ref),
        commit: async () => ops.forEach((ref) => store.delete(ref.path)),
      };
    },
    async recursiveDelete(ref) {
      for (const path of [...store.keys()]) if (path === ref.path || path.startsWith(`${ref.path}/`)) store.delete(path);
    },
  };
}

function scenario() {
  return {
    // Владелец (alice) с двумя участниками и данными
    'users/alice': { label: 'alice@x.ru' },
    'users/alice/consents/c1': { version: 1 },
    'users/bob': { activeGarageId: 'alice', label: 'bob@x.ru' },
    'users/carol': { activeGarageId: 'alice', label: 'carol@x.ru' },
    'garages/alice': { ownerId: 'alice', members: ['alice', 'bob', 'carol'], memberEmails: {} },
    'cars/car1': { garageId: 'alice', make: 'Toyota' },
    'cars/car2': { garageId: 'alice', deletedAt: 1 },
    'service_records/s1': { garageId: 'alice' },
    'expenses/e1': { garageId: 'alice' },
    'reminders/r1': { garageId: 'alice' },
    'garage_invites/ABC123': { garageId: 'alice', createdBy: 'bob' },
    'garage_join_requests/j1': { garageId: 'alice', uid: 'dave' },
    // Чужой гараж (zed), в котором alice тоже числится участником
    'garages/zed': { ownerId: 'zed', members: ['zed', 'alice'], memberEmails: { zed: 'z', alice: 'a' } },
    'cars/zcar': { garageId: 'zed', make: 'Kia' },
    'garage_invites/ZED111': { garageId: 'zed', createdBy: 'alice' },
    'garage_join_requests/j2': { garageId: 'zed', uid: 'alice' },
    // Совершенно посторонние данные
    'users/erin': { label: 'erin@x.ru' },
    'garages/erin': { ownerId: 'erin', members: ['erin'] },
    'cars/ecar': { garageId: 'erin', make: 'BMW' },
    'garage_join_requests/j3': { garageId: 'erin', uid: 'frank' },
  };
}

function makeAuth(db, { failWith } = {}) {
  return {
    deleted: [],
    async deleteUser(uid) {
      db.order.push('auth.deleteUser');
      if (failWith) throw Object.assign(new Error('x'), { code: failWith });
      this.deleted.push(uid);
    },
  };
}

test('удаляет всё своё и не трогает чужое', async () => {
  const db = createFakeDb(scenario());
  const auth = makeAuth(db);
  const report = await deleteAccountData({ db, auth, FieldValue, uid: 'alice' });

  const left = [...db.store.keys()].sort();
  assert.deepEqual(left, [
    'cars/ecar',
    'cars/zcar',
    'garage_join_requests/j3',
    'garages/erin',
    'garages/zed',
    'users/bob',
    'users/carol',
    'users/erin',
  ]);
  assert.equal(report.detachedMembers, 2);
  assert.equal(report.removedFromGarages, 1);
  assert.deepEqual(auth.deleted, ['alice']);
});

test('из чужого гаража убирает только себя, данные гаража остаются', async () => {
  const db = createFakeDb(scenario());
  await deleteAccountData({ db, auth: makeAuth(db), FieldValue, uid: 'alice' });
  const zed = db.store.get('garages/zed');
  assert.deepEqual(zed.members, ['zed']);
  assert.deepEqual(zed.memberEmails, { zed: 'z' });
  assert.ok(db.store.has('cars/zcar'));
});

test('участников своего гаража возвращает в их собственные гаражи', async () => {
  const db = createFakeDb(scenario());
  await deleteAccountData({ db, auth: makeAuth(db), FieldValue, uid: 'alice' });
  assert.equal('activeGarageId' in db.store.get('users/bob'), false);
  assert.equal('activeGarageId' in db.store.get('users/carol'), false);
  assert.equal(db.store.get('users/bob').label, 'bob@x.ru'); // профиль остался
});

test('удаляет журнал согласий вместе с профилем', async () => {
  const db = createFakeDb(scenario());
  await deleteAccountData({ db, auth: makeAuth(db), FieldValue, uid: 'alice' });
  assert.equal(db.store.has('users/alice'), false);
  assert.equal(db.store.has('users/alice/consents/c1'), false);
});

test('удаляет надгробия (deletedAt) — в них тоже лежит garageId', async () => {
  const db = createFakeDb(scenario());
  await deleteAccountData({ db, auth: makeAuth(db), FieldValue, uid: 'alice' });
  assert.equal(db.store.has('cars/car2'), false);
});

test('аккаунт входа удаляется последним: сначала данные', async () => {
  const db = createFakeDb(scenario());
  const auth = makeAuth(db);
  let dataGoneAtAuthDelete = null;
  const origDelete = auth.deleteUser.bind(auth);
  auth.deleteUser = async (uid) => {
    dataGoneAtAuthDelete = !db.store.has('users/alice') && !db.store.has('garages/alice') && !db.store.has('cars/car1');
    return origDelete(uid);
  };
  await deleteAccountData({ db, auth, FieldValue, uid: 'alice' });
  assert.equal(dataGoneAtAuthDelete, true);
});

test('повторный вызов и уже удалённый Auth-пользователь — не ошибка', async () => {
  const db = createFakeDb(scenario());
  await deleteAccountData({ db, auth: makeAuth(db), FieldValue, uid: 'alice' });
  await deleteAccountData({ db, auth: makeAuth(db, { failWith: 'auth/user-not-found' }), FieldValue, uid: 'alice' });
});

test('прочая ошибка Auth пробрасывается — клиент увидит сбой и сможет повторить', async () => {
  const db = createFakeDb(scenario());
  await assert.rejects(
    deleteAccountData({ db, auth: makeAuth(db, { failWith: 'auth/internal-error' }), FieldValue, uid: 'alice' }),
    /x/,
  );
});

test('пользователь Telegram: стираются его служебные заявки входа', async () => {
  const db = createFakeDb({
    'users/telegram:42': { label: '@tg' },
    'garages/telegram:42': { ownerId: 'telegram:42', members: ['telegram:42'] },
    'telegram_login_requests/tok1': { telegramUserId: '42', status: 'verified' },
    'telegram_login_requests/tok2': { telegramUserId: '43', status: 'verified' },
  });
  await deleteAccountData({ db, auth: makeAuth(db), FieldValue, uid: 'telegram:42' });
  assert.equal(db.store.has('telegram_login_requests/tok1'), false);
  assert.equal(db.store.has('telegram_login_requests/tok2'), true);
});

test('большой объём данных удаляется пачками, без потерь', async () => {
  const initial = { 'garages/big': { ownerId: 'big', members: ['big'] }, 'users/big': {} };
  for (let i = 0; i < 1000; i++) initial[`expenses/e${i}`] = { garageId: 'big' };
  initial['expenses/other'] = { garageId: 'someone-else' };
  const db = createFakeDb(initial);
  await deleteAccountData({ db, auth: makeAuth(db), FieldValue, uid: 'big' });
  assert.deepEqual([...db.store.keys()], ['expenses/other']);
});
