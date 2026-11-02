import { randomBytes, randomUUID } from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { modelsFor } from '../../src/modules/models.js';

describe('Recorded payments with recipient confirmation', () => {
  let connection: Connection;
  let app: ReturnType<typeof createApp>;
  const database = `monivo_test_phase5_${randomBytes(8).toString('hex')}`;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const auth = (name: string) => ({ Authorization: `Bearer ${tokens[name]}` });
  const ledger = (name = 'a') =>
    request(app).get('/api/ledger').set(auth(name));
  const record = (
    groupId: string,
    amount: number,
    requestId = randomUUID(),
    recipient = 'a',
    sender = 'b',
  ) =>
    request(app)
      .post(`/api/groups/${groupId}/payments`)
      .set(auth(sender))
      .send({ requestId, toId: ids[recipient], amount });
  const respond = (id: string, actor: string, action: string) =>
    request(app)
      .post(`/api/payments/${id}/respond`)
      .set(auth(actor))
      .send({ action });
  async function fixture() {
    const group = await request(app)
      .post('/api/groups')
      .set(auth('a'))
      .send({ name: 'Payment test' });
    const groupId = group.body.group.id as string;
    const invite = await request(app)
      .post(`/api/groups/${groupId}/invite`)
      .set(auth('a'));
    for (const name of ['b', 'c'])
      await request(app)
        .post(`/api/invitations/${invite.body.token}/join`)
        .set(auth(name));
    const expense = {
      description: 'Dinner',
      amount: 10000,
      payerId: ids.a,
      splitMode: 'custom',
      shares: [
        { userId: ids.a, amount: 0 },
        { userId: ids.b, amount: 10000 },
      ],
    };
    const e = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set(auth('a'))
      .send({ requestId: randomUUID(), expense });
    expect(e.status).toBe(201);
    return { groupId, expenseId: e.body.expense.id as string, expense };
  }
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
    for (const name of ['a', 'b', 'c', 'outsider']) {
      const r = await request(app)
        .post('/api/auth/google')
        .send({ idToken: name });
      tokens[name] = r.body.token;
      ids[name] = r.body.user.id;
    }
  }, 15000);
  afterAll(async () => {
    if (connection) {
      if (
        connection.name !== database ||
        !database.startsWith('monivo_test_phase5_')
      )
        throw new Error('Refusing non-test database cleanup');
      await connection.dropDatabase();
      await connection.close();
    }
  });

  it('validates identities, permissions, amount and available group balances', async () => {
    const f = await fixture();
    expect(
      (await request(app).post(`/api/groups/${f.groupId}/payments`).send({}))
        .status,
    ).toBe(401);
    expect(
      (await record(f.groupId, 100, randomUUID(), 'a', 'outsider')).status,
    ).toBe(404);
    expect((await record(f.groupId, 0)).status).toBe(400);
    expect((await record(f.groupId, 1.5)).status).toBe(400);
    expect((await record(f.groupId, 10001)).status).toBe(409);
    expect((await record(f.groupId, 100, randomUUID(), 'b')).status).toBe(400);
    expect(
      (await record(f.groupId, 100, randomUUID(), 'outsider')).status,
    ).toBe(400);
    expect((await record(f.groupId, 100, randomUUID(), 'c')).status).toBe(409);
    expect((await record(f.groupId, 100, randomUUID(), 'b', 'a')).status).toBe(
      409,
    );
    expect((await ledger('outsider')).body).toEqual({
      expenses: [],
      payments: [],
      balances: [],
    });
  });

  it('keeps pending balances unchanged, reserves capacity, and confirms exactly once', async () => {
    const f = await fixture();
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => record(f.groupId, 4000, key)),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.payment.id)).size).toBe(1);
    const paymentId = results[0]!.body.payment.id;
    let state = (await ledger()).body;
    let balance = state.balances.find(
      (g: { groupId: string }) => g.groupId === f.groupId,
    );
    expect(
      balance.members.find((m: { userId: string }) => m.userId === ids.b),
    ).toMatchObject({ amount: -10000, availableToPay: 6000 });
    expect((await record(f.groupId, 4001, key)).status).toBe(409);
    expect((await record(f.groupId, 6001)).status).toBe(409);
    expect((await respond(paymentId, 'b', 'confirm')).status).toBe(403);
    expect((await respond(paymentId, 'c', 'confirm')).status).toBe(403);
    expect((await respond(paymentId, 'outsider', 'confirm')).status).toBe(404);
    const confirmations = await Promise.all([
      respond(paymentId, 'a', 'confirm'),
      respond(paymentId, 'a', 'confirm'),
    ]);
    expect(confirmations.every((r) => r.status === 200)).toBe(true);
    expect((await respond(paymentId, 'b', 'cancel')).status).toBe(409);
    state = (await ledger()).body;
    balance = state.balances.find(
      (g: { groupId: string }) => g.groupId === f.groupId,
    );
    expect(
      balance.members.find((m: { userId: string }) => m.userId === ids.b)
        .amount,
    ).toBe(-6000);
    expect(
      balance.members.reduce(
        (sum: number, m: { amount: number }) => sum + m.amount,
        0,
      ),
    ).toBe(0);
    const rest = await record(f.groupId, 6000);
    expect((await respond(rest.body.payment.id, 'a', 'confirm')).status).toBe(
      200,
    );
    balance = (await ledger()).body.balances.find(
      (g: { groupId: string }) => g.groupId === f.groupId,
    );
    expect(
      balance.members.every((m: { amount: number }) => m.amount === 0),
    ).toBe(true);
    // Simulate an API restart: the stored request ID still resolves to the same payment.
    app = createApp(() => true, { connection });
    const replay = await record(f.groupId, 4000, key);
    expect(replay.body.payment).toMatchObject({
      id: paymentId,
      status: 'confirmed',
    });
  });

  it('serializes distinct concurrent payment requests to prevent over-reservation', async () => {
    const f = await fixture();
    const responses = await Promise.all([
      record(f.groupId, 7000),
      record(f.groupId, 7000),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await modelsFor(connection).Payment.countDocuments({
        groupId: f.groupId,
      }),
    ).toBe(1);
  });

  it('releases rejected/cancelled reservations and unlocks expenses only when all covering records are resolved', async () => {
    const f = await fixture();
    const p = await record(f.groupId, 4000);
    const q = await record(f.groupId, 1000);
    const edit = () =>
      request(app)
        .patch(`/api/expenses/${f.expenseId}`)
        .set(auth('a'))
        .send({ version: 1, expense: f.expense });
    expect((await edit()).status).toBe(409);
    expect(
      (await request(app).get(`/api/expenses/${f.expenseId}`).set(auth('a')))
        .body.expense.locked,
    ).toBe(true);
    expect(
      (
        await request(app)
          .delete(`/api/expenses/${f.expenseId}`)
          .set(auth('a'))
          .send({ version: 1 })
      ).status,
    ).toBe(409);
    expect((await respond(p.body.payment.id, 'a', 'cancel')).status).toBe(403);
    expect((await respond(p.body.payment.id, 'b', 'reject')).status).toBe(403);
    expect(
      (await respond(p.body.payment.id, 'a', 'reject')).body.payment.status,
    ).toBe('rejected');
    expect((await edit()).status).toBe(409);
    expect(
      (await respond(q.body.payment.id, 'b', 'cancel')).body.payment.status,
    ).toBe('cancelled');
    expect((await respond(q.body.payment.id, 'b', 'cancel')).status).toBe(200);
    expect((await respond(p.body.payment.id, 'a', 'confirm')).status).toBe(409);
    expect((await edit()).status).toBe(200);
    const balance = (await ledger()).body.balances.find(
      (g: { groupId: string }) => g.groupId === f.groupId,
    );
    expect(
      balance.members.find((m: { userId: string }) => m.userId === ids.b),
    ).toMatchObject({ amount: -10000, availableToPay: 10000 });
  });

  it('keeps confirmed expense snapshots immutable and permits new correction expenses', async () => {
    const f = await fixture();
    const p = await record(f.groupId, 10000);
    expect((await respond(p.body.payment.id, 'a', 'confirm')).status).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/expenses/${f.expenseId}`)
          .set(auth('a'))
          .send({ version: 1, expense: f.expense })
      ).status,
    ).toBe(409);
    const correction = await request(app)
      .post(`/api/groups/${f.groupId}/expenses`)
      .set(auth('a'))
      .send({
        requestId: randomUUID(),
        expense: {
          ...f.expense,
          description: 'Correction',
          amount: 100,
          payerId: ids.b,
          shares: [{ userId: ids.a, amount: 100 }],
        },
      });
    expect(correction.status).toBe(201);
    expect(
      (
        await request(app)
          .delete(`/api/expenses/${correction.body.expense.id}`)
          .set(auth('a'))
          .send({ version: 1 })
      ).status,
    ).toBe(204);
  });

  it('serializes expense edits against payment reservations', async () => {
    const f = await fixture();
    const [payment, edit] = await Promise.all([
      record(f.groupId, 7000),
      request(app)
        .patch(`/api/expenses/${f.expenseId}`)
        .set(auth('a'))
        .send({
          version: 1,
          expense: {
            ...f.expense,
            amount: 4000,
            shares: [{ userId: ids.b, amount: 4000 }],
          },
        }),
    ]);
    expect([
      [201, 409],
      [409, 200],
    ]).toContainEqual([payment.status, edit.status]);
    const expense = await modelsFor(connection).Expense.findById(f.expenseId);
    expect(expense!.amount).toBe(payment.status === 201 ? 10000 : 4000);
  });

  it('resolves confirmation/cancellation races once and never changes an existing pending payment when new expenses arrive', async () => {
    const f = await fixture();
    const p = await record(f.groupId, 10000);
    const correction = await request(app)
      .post(`/api/groups/${f.groupId}/expenses`)
      .set(auth('b'))
      .send({
        requestId: randomUUID(),
        expense: {
          ...f.expense,
          description: 'Later expense',
          payerId: ids.b,
          shares: [{ userId: ids.a, amount: 10000 }],
        },
      });
    expect(correction.status).toBe(201);
    const results = await Promise.all([
      respond(p.body.payment.id, 'a', 'confirm'),
      respond(p.body.payment.id, 'b', 'cancel'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const payment = await modelsFor(connection).Payment.findById(
      p.body.payment.id,
    );
    const balance = (await ledger()).body.balances.find(
      (g: { groupId: string }) => g.groupId === f.groupId,
    );
    expect(
      balance.members.find((m: { userId: string }) => m.userId === ids.b)
        .amount,
    ).toBe(payment!.status === 'confirmed' ? 10000 : 0);
  });
});
