import { randomBytes, randomUUID } from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { modelsFor } from '../../src/modules/models.js';
import { groupLedger } from '../../src/modules/ledger.js';

describe('Bounded history and complete balances', () => {
  const database = `monivo_test_phase8_${randomBytes(8).toString('hex')}`;
  let connection: Connection;
  let app: ReturnType<typeof createApp>;
  let groupId: string;
  let privateId: string;
  const tokens: Record<string, string> = {},
    ids: Record<string, string> = {};
  const auth = (name = 'b') => ({ Authorization: `Bearer ${tokens[name]}` });
  beforeAll(async () => {
    connection = await mongoose
      .createConnection(
        process.env.TEST_MONGODB_URI ??
          'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true',
        { dbName: database, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    await Promise.all(
      Object.values(modelsFor(connection)).map((m) => m.init()),
    );
    app = createApp(() => true, {
      connection,
      verifyGoogleToken: async (sub) => ({
        sub,
        email: `${sub}@example.com`,
        name: sub,
      }),
    });
    for (const name of ['a', 'b', 'outsider']) {
      const r = await request(app)
        .post('/api/auth/google')
        .send({ idToken: name });
      tokens[name] = r.body.token;
      ids[name] = r.body.user.id;
    }
    const group = await request(app)
      .post('/api/groups')
      .set(auth('a'))
      .send({ name: 'Pagination' });
    groupId = group.body.group.id;
    const invite = await request(app)
      .post(`/api/groups/${groupId}/invite`)
      .set(auth('a'));
    await request(app)
      .post(`/api/invitations/${invite.body.token}/join`)
      .set(auth());
    const privateGroup = await request(app)
      .post('/api/groups')
      .set(auth('a'))
      .send({ name: 'Private' });
    privateId = privateGroup.body.group.id;
    const { Expense, Payment } = modelsFor(connection);
    const at = new Date('2026-01-01T00:00:00.000Z');
    await Expense.insertMany(
      Array.from({ length: 57 }, (_, index) => ({
        groupId,
        createdBy: ids.a,
        payerId: ids.a,
        description: `Cost ${index}`,
        amount: 101,
        splitMode: 'custom',
        shares: [{ userId: ids.b, amount: 101 }],
        requestId: randomUUID(),
        requestHash: 'fixture',
        version: 1,
        deleted: false,
        createdAt: at,
        updatedAt: at,
      })),
    );
    await Expense.create({
      groupId: privateId,
      createdBy: ids.a,
      payerId: ids.a,
      description: 'Private cost',
      amount: 1,
      splitMode: 'custom',
      shares: [{ userId: ids.a, amount: 1 }],
      requestId: randomUUID(),
      requestHash: 'fixture',
    });
    await Payment.insertMany(
      Array.from({ length: 53 }, (_, index) => ({
        groupId,
        fromId: ids.b,
        toId: ids.a,
        amount: 1,
        requestId: randomUUID(),
        status: index < 24 ? 'pending' : index < 49 ? 'confirmed' : 'rejected',
        expenseIds: [],
        createdAt: new Date(
          index < 24 ? '2025-01-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
        ),
        updatedAt: at,
      })),
    );
  }, 15000);
  afterAll(async () => {
    if (connection) {
      if (
        connection.name !== database ||
        !database.startsWith('monivo_test_phase8_')
      )
        throw new Error('Refusing non-test cleanup');
      await connection.dropDatabase();
      await connection.close();
    }
  });
  async function all(path: string, field: string, limit = 7) {
    const rows: { id: string; status?: string; groupId: string }[] = [];
    let cursor: string | null = null;
    for (let n = 0; n < 100; n++) {
      const response: request.Response = await request(app)
        .get(
          `${path}${path.includes('?') ? '&' : '?'}limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
        )
        .set(auth());
      expect(response.status).toBe(200);
      expect(response.body[field].length).toBeLessThanOrEqual(limit);
      rows.push(...response.body[field]);
      cursor = response.body.nextCursor;
      if (!cursor) return rows;
    }
    throw new Error('Pagination did not terminate');
  }
  it('paginates tied timestamps without duplicates or missing entries', async () => {
    const groupRows = await all(`/api/groups/${groupId}/expenses`, 'expenses');
    expect(groupRows).toHaveLength(57);
    expect(new Set(groupRows.map((e) => e.id)).size).toBe(57);
    expect(groupRows.map((e) => e.id)).toEqual(
      [...groupRows.map((e) => e.id)].sort().reverse(),
    );
    expect((await all('/api/expenses', 'expenses')).map((e) => e.id)).toEqual(
      groupRows.map((e) => e.id),
    );
    expect((await all('/api/payments', 'payments')).length).toBe(53);
  });
  it('keeps pending payments accessible even when newer history fills the preview', async () => {
    const pending = await all('/api/payments?pending=1', 'payments');
    expect(pending).toHaveLength(24);
    expect(pending.every((p) => p.status === 'pending')).toBe(true);
    const snapshot = (await request(app).get('/api/ledger').set(auth())).body;
    expect(snapshot.payments).toHaveLength(20);
    expect(
      snapshot.payments.some((p: { status: string }) => p.status === 'pending'),
    ).toBe(false);
    expect(snapshot.expenses).toHaveLength(20);
    const summary = (
      await request(app).get('/api/ledger?summary=1').set(auth())
    ).body;
    expect(summary.expenses).toEqual([]);
    expect(summary.payments).toEqual([]);
    expect(summary.balances).toEqual(snapshot.balances);
    const balance = snapshot.balances
      .find((g: { groupId: string }) => g.groupId === groupId)
      .members.find((m: { userId: string }) => m.userId === ids.b);
    expect(balance).toMatchObject({
      amount: -(57 * 101) + 25,
      availableToPay: 57 * 101 - 25 - 24,
    });
    const group = await modelsFor(connection).Group.findById(groupId);
    const expected = await connection.transaction((session) =>
      groupLedger(connection, group!, session),
    );
    for (const member of expected.members)
      expect(
        snapshot.balances[0].members.find(
          (m: { userId: string }) => m.userId === member.userId,
        ),
      ).toMatchObject(member);
  });
  it('validates bounds and cursor shapes and keeps authorization on every page', async () => {
    for (const query of [
      'limit=0',
      'limit=51',
      'limit=1.5',
      'cursor=not-json',
      'cursor=%25',
      'limit=2&unexpected=1',
    ])
      expect(
        (await request(app).get(`/api/expenses?${query}`).set(auth())).status,
      ).toBe(400);
    const cursor = Buffer.from(
      JSON.stringify({ at: '2099-01-01T00:00:00.000Z', id: 'f'.repeat(24) }),
    ).toString('base64url');
    expect(
      (
        await request(app)
          .get(`/api/groups/${privateId}/expenses?cursor=${cursor}`)
          .set(auth())
      ).status,
    ).toBe(404);
    const page = await request(app)
      .get(`/api/expenses?cursor=${cursor}`)
      .set(auth());
    expect(
      page.body.expenses.every(
        (e: { groupId: string }) => e.groupId === groupId,
      ),
    ).toBe(true);
    for (const path of [
      '/api/expenses',
      '/api/payments',
      '/api/payments?pending=1',
    ]) {
      expect((await request(app).get(path)).status).toBe(401);
      const outsider = await request(app).get(path).set(auth('outsider'));
      expect(outsider.status).toBe(200);
      expect(outsider.body.nextCursor).toBeNull();
      expect(outsider.body.expenses ?? outsider.body.payments).toEqual([]);
    }
  });
  it('does not duplicate existing entries when new expenses arrive between pages', async () => {
    const first = await request(app).get('/api/expenses?limit=5').set(auth());
    await modelsFor(connection).Expense.create({
      groupId,
      createdBy: ids.a,
      payerId: ids.a,
      description: 'New arrival',
      amount: 1,
      splitMode: 'custom',
      shares: [{ userId: ids.b, amount: 1 }],
      requestId: randomUUID(),
      requestHash: 'fixture',
    });
    const next = await request(app)
      .get(`/api/expenses?limit=5&cursor=${first.body.nextCursor}`)
      .set(auth());
    expect(
      next.body.expenses.some((e: { id: string }) =>
        first.body.expenses.some((p: { id: string }) => p.id === e.id),
      ),
    ).toBe(false);
    expect(
      (await request(app).get('/api/expenses?limit=5').set(auth())).body
        .expenses[0].description,
    ).toBe('New arrival');
  });
  it('recovers an already-saved expense after another participant leaves', async () => {
    const group = await request(app)
      .post('/api/groups')
      .set(auth('a'))
      .send({ name: 'Retry after departure' });
    const id = group.body.group.id;
    const invite = await request(app)
      .post(`/api/groups/${id}/invite`)
      .set(auth('a'));
    await request(app)
      .post(`/api/invitations/${invite.body.token}/join`)
      .set(auth());
    const original = {
      requestId: randomUUID(),
      expense: {
        description: 'Original',
        amount: 100,
        payerId: ids.a,
        splitMode: 'custom',
        shares: [{ userId: ids.b, amount: 100 }],
      },
    };
    const saved = await request(app)
      .post(`/api/groups/${id}/expenses`)
      .set(auth('a'))
      .send(original);
    await request(app)
      .post(`/api/groups/${id}/expenses`)
      .set(auth('a'))
      .send({
        requestId: randomUUID(),
        expense: {
          ...original.expense,
          payerId: ids.b,
          shares: [{ userId: ids.a, amount: 100 }],
        },
      });
    expect(
      (await request(app).post(`/api/groups/${id}/leave`).set(auth())).status,
    ).toBe(204);
    const replay = await request(app)
      .post(`/api/groups/${id}/expenses`)
      .set(auth('a'))
      .send(original);
    expect(replay.status).toBe(201);
    expect(replay.body.expense.id).toBe(saved.body.expense.id);
    expect(replay.body.expense.locked).toBe(true);
    expect(
      (
        await request(app)
          .post(`/api/groups/${id}/expenses`)
          .set(auth('a'))
          .send({ ...original, requestId: randomUUID() })
      ).status,
    ).toBe(400);
    expect(
      await modelsFor(connection).Expense.countDocuments({ groupId: id }),
    ).toBe(2);
  });
  it('matches authoritative calculations for mixed three-member costs and payment states', async () => {
    const group = await request(app)
      .post('/api/groups')
      .set(auth('a'))
      .send({ name: 'Mixed ledger' });
    const id = group.body.group.id;
    const invite = await request(app)
      .post(`/api/groups/${id}/invite`)
      .set(auth('a'));
    for (const who of ['b', 'outsider'])
      await request(app)
        .post(`/api/invitations/${invite.body.token}/join`)
        .set(auth(who));
    const { Expense, Payment, Group } = modelsFor(connection);
    for (const entry of [
      {
        payerId: ids.a,
        amount: 10001,
        shares: [
          { userId: ids.a, amount: 3334 },
          { userId: ids.b, amount: 3334 },
          { userId: ids.outsider, amount: 3333 },
        ],
      },
      {
        payerId: ids.b,
        amount: 5000,
        shares: [{ userId: ids.outsider, amount: 5000 }],
      },
      {
        payerId: ids.outsider,
        amount: 7000,
        shares: [
          { userId: ids.a, amount: 0 },
          { userId: ids.b, amount: 7000 },
        ],
      },
      {
        payerId: ids.a,
        amount: 9999,
        shares: [{ userId: ids.b, amount: 9999 }],
        deleted: true,
      },
    ])
      await Expense.create({
        ...entry,
        groupId: id,
        createdBy: ids.a,
        description: 'Fixture',
        splitMode: 'custom',
        requestId: randomUUID(),
        requestHash: 'fixture',
      });
    for (const entry of [
      { fromId: ids.b, toId: ids.a, amount: 1000, status: 'confirmed' },
      { fromId: ids.outsider, toId: ids.b, amount: 500, status: 'confirmed' },
      { fromId: ids.outsider, toId: ids.a, amount: 700, status: 'pending' },
      { fromId: ids.b, toId: ids.outsider, amount: 100, status: 'pending' },
      { fromId: ids.a, toId: ids.b, amount: 1000000, status: 'rejected' },
      { fromId: ids.outsider, toId: ids.a, amount: 1000, status: 'cancelled' },
    ] as const)
      await Payment.create({ ...entry, groupId: id, requestId: randomUUID() });
    const record = await Group.findById(id);
    const expected = await connection.transaction((session) =>
      groupLedger(connection, record!, session),
    );
    const result = await request(app)
      .get('/api/ledger?summary=1')
      .set(auth('a'));
    const actual = result.body.balances.find(
      (g: { groupId: string }) => g.groupId === id,
    ).members;
    for (const member of expected.members)
      expect(
        actual.find((m: { userId: string }) => m.userId === member.userId),
      ).toMatchObject(member);
    expect(
      actual.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0),
    ).toBe(0);
    expect(
      actual.find((m: { userId: string }) => m.userId === ids.a).amount,
    ).toBe(5667);
  });
});
