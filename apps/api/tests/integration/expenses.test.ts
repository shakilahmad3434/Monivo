import { randomBytes, randomUUID } from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { splitEqually } from '@monivo/shared';
import { createApp } from '../../src/app.js';
import { modelsFor } from '../../src/modules/models.js';

describe('Persistent expenses and duplicate-safe saves', () => {
  let connection: Connection;
  let app: ReturnType<typeof createApp>;
  const database = `monivo_test_phase4_${randomBytes(8).toString('hex')}`;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let groupId: string;
  let expenseId: string;
  let savedRequest: ReturnType<typeof payload>;
  const payload = () => ({
    requestId: randomUUID(),
    expense: {
      description: 'Dinner',
      amount: 10001,
      payerId: ids.a!,
      splitMode: 'equal',
      shares: splitEqually(10001, [ids.a!, ids.b!]),
    },
  });
  const auth = (name: string) => ({ Authorization: `Bearer ${tokens[name]}` });
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
    for (const name of ['a', 'b', 'c']) {
      const r = await request(app)
        .post('/api/auth/google')
        .send({ idToken: name });
      tokens[name] = r.body.token;
      ids[name] = r.body.user.id;
    }
    const g = await request(app)
      .post('/api/groups')
      .set(auth('a'))
      .send({ name: 'Phase 4' });
    groupId = g.body.group.id;
    const invite = await request(app)
      .post(`/api/groups/${groupId}/invite`)
      .set(auth('a'));
    await request(app)
      .post(`/api/invitations/${invite.body.token}/join`)
      .set(auth('b'));
  }, 15000);
  afterAll(async () => {
    if (connection) {
      if (
        connection.name !== database ||
        !database.startsWith('monivo_test_phase4_')
      )
        throw new Error('Refusing non-test database cleanup');
      await connection.dropDatabase();
      await connection.close();
    }
  });
  it('rejects outsiders, non-members, invalid amounts, invalid shares and forged equal splits', async () => {
    const url = `/api/groups/${groupId}/expenses`;
    expect((await request(app).post(url).send(payload())).status).toBe(401);
    expect(
      (await request(app).post(url).set(auth('c')).send(payload())).status,
    ).toBe(404);
    for (const mutate of [
      (p: ReturnType<typeof payload>) => {
        p.expense.amount = 1.1;
      },
      (p: ReturnType<typeof payload>) => {
        p.expense.amount = 0;
      },
      (p: ReturnType<typeof payload>) => {
        p.expense.payerId = ids.c!;
      },
      (p: ReturnType<typeof payload>) => {
        p.expense.shares[0]!.userId = ids.c!;
      },
      (p: ReturnType<typeof payload>) => {
        p.expense.shares[1]!.userId = p.expense.shares[0]!.userId;
      },
      (p: ReturnType<typeof payload>) => {
        p.expense.shares[0]!.amount += 1;
      },
      (p: ReturnType<typeof payload>) => {
        p.expense.shares[0]!.amount += 1;
        p.expense.shares[1]!.amount -= 1;
      },
    ]) {
      const p = payload();
      mutate(p);
      expect((await request(app).post(url).set(auth('a')).send(p)).status).toBe(
        400,
      );
    }
    expect(await modelsFor(connection).Expense.countDocuments()).toBe(0);
  });
  it('stores one expense for simultaneous double taps and replays after restart', async () => {
    savedRequest = payload();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/groups/${groupId}/expenses`)
          .set(auth('a'))
          .send(savedRequest),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(responses.map((r) => r.body.expense.id)).size).toBe(1);
    expenseId = responses[0]!.body.expense.id;
    expect(await modelsFor(connection).Expense.countDocuments()).toBe(1);
    const rebuilt = createApp(() => true, { connection });
    const replay = await request(rebuilt)
      .post(`/api/groups/${groupId}/expenses`)
      .set(auth('a'))
      .send(savedRequest);
    expect(replay.body.expense.id).toBe(expenseId);
    expect(replay.body.expense.updatedAt).toBe(
      responses[0]!.body.expense.updatedAt,
    );
    const conflict = structuredClone(savedRequest);
    conflict.expense.description = 'Different dinner';
    expect(
      (
        await request(app)
          .post(`/api/groups/${groupId}/expenses`)
          .set(auth('a'))
          .send(conflict)
      ).status,
    ).toBe(409);
  });
  it('derives exact balances and protects expense reads/edits', async () => {
    expect(
      (await request(app).get(`/api/expenses/${expenseId}`).set(auth('c')))
        .status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/groups/${groupId}/expenses`).set(auth('c')))
        .status,
    ).toBe(404);
    const ledger = await request(app).get('/api/ledger').set(auth('b'));
    const members = ledger.body.balances[0].members as {
      userId: string;
      amount: number;
    }[];
    expect(members.reduce((sum, m) => sum + m.amount, 0)).toBe(0);
    expect(members.find((m) => m.userId === ids.b)?.amount).toBe(
      -savedRequest.expense.shares.find((s) => s.userId === ids.b)!.amount,
    );
    expect((await request(app).get('/api/ledger').set(auth('c'))).body).toEqual(
      { expenses: [], payments: [], balances: [] },
    );
    expect(
      (
        await request(app)
          .patch(`/api/expenses/${expenseId}`)
          .set(auth('b'))
          .send({ version: 1, expense: savedRequest.expense })
      ).status,
    ).toBe(403);
  });
  it('supports custom splits and rejects stale edits or deletes', async () => {
    const expense = {
      ...savedRequest.expense,
      amount: 12000,
      splitMode: 'custom',
      shares: [
        { userId: ids.a, amount: 2000 },
        { userId: ids.b, amount: 10000 },
      ],
    };
    const updates = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .patch(`/api/expenses/${expenseId}`)
          .set(auth('a'))
          .send({ version: 1, expense }),
      ),
    );
    expect(updates.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await request(app)
          .delete(`/api/expenses/${expenseId}`)
          .set(auth('a'))
          .send({ version: 1 })
      ).status,
    ).toBe(409);
    const ledger = await request(app).get('/api/ledger').set(auth('a'));
    expect(
      ledger.body.balances[0].members.find(
        (m: { userId: string }) => m.userId === ids.a,
      ).amount,
    ).toBe(10000);
    expect(ledger.body.expenses[0].version).toBe(2);
  });
  it('soft-deletes without resurrecting a retried save and restores balances', async () => {
    expect(
      (
        await request(app)
          .delete(`/api/expenses/${expenseId}`)
          .set(auth('b'))
          .send({ version: 2 })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete(`/api/expenses/${expenseId}`)
          .set(auth('a'))
          .send({ version: 2 })
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app)
          .delete(`/api/expenses/${expenseId}`)
          .set(auth('a'))
          .send({ version: 2 })
      ).status,
    ).toBe(204);
    const replay = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set(auth('a'))
      .send(savedRequest);
    expect(replay.body.expense.deleted).toBe(true);
    expect(
      (await request(app).get(`/api/expenses/${expenseId}`).set(auth('a')))
        .status,
    ).toBe(404);
    const ledger = await request(app).get('/api/ledger').set(auth('a'));
    expect(ledger.body.expenses).toEqual([]);
    expect(
      ledger.body.balances[0].members.every(
        (m: { amount: number }) => m.amount === 0,
      ),
    ).toBe(true);
    expect(await modelsFor(connection).Expense.countDocuments()).toBe(1);
  });
  it('allows a payer outside the split and zero custom shares without losing paise', async () => {
    for (const expense of [
      {
        description: 'Covered a friend',
        amount: 199,
        payerId: ids.a,
        splitMode: 'custom',
        shares: [{ userId: ids.b, amount: 199 }],
      },
      {
        description: 'One paise',
        amount: 1,
        payerId: ids.b,
        splitMode: 'custom',
        shares: [
          { userId: ids.a, amount: 0 },
          { userId: ids.b, amount: 1 },
        ],
      },
    ]) {
      expect(
        (
          await request(app)
            .post(`/api/groups/${groupId}/expenses`)
            .set(auth('b'))
            .send({ requestId: randomUUID(), expense })
        ).status,
      ).toBe(201);
    }
    const ledger = await request(app).get('/api/ledger').set(auth('a'));
    expect(
      ledger.body.balances[0].members.find(
        (m: { userId: string }) => m.userId === ids.a,
      ).amount,
    ).toBe(199);
    expect(
      ledger.body.balances[0].members.find(
        (m: { userId: string }) => m.userId === ids.b,
      ).amount,
    ).toBe(-199);
  });
});
