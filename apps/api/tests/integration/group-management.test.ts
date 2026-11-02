import { randomBytes, randomUUID } from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { modelsFor } from '../../src/modules/models.js';

describe('Group management and safe departure', () => {
  let connection: Connection;
  let app: ReturnType<typeof createApp>;
  const database = `monivo_test_phase7_${randomBytes(8).toString('hex')}`;
  const tokens: Record<string, string> = {},
    ids: Record<string, string> = {};
  const auth = (name: string) => ({ Authorization: `Bearer ${tokens[name]}` });
  const leave = (id: string, who = 'b') =>
    request(app).post(`/api/groups/${id}/leave`).set(auth(who));
  const invite = (id: string, who = 'a') =>
    request(app).post(`/api/groups/${id}/invite`).set(auth(who));
  const join = (token: string, who = 'b') =>
    request(app).post(`/api/invitations/${token}/join`).set(auth(who));
  const rename = (id: string, who = 'a') =>
    request(app)
      .patch(`/api/groups/${id}`)
      .set(auth(who))
      .send({ name: 'New name' });
  const transfer = (id: string, target = 'b', who = 'a') =>
    request(app)
      .post(`/api/groups/${id}/owner`)
      .set(auth(who))
      .send({ newOwnerId: ids[target] });
  const expense = (
    id: string,
    payer = 'a',
    participant = 'b',
    amount = 10000,
  ) =>
    request(app)
      .post(`/api/groups/${id}/expenses`)
      .set(auth('a'))
      .send({
        requestId: randomUUID(),
        expense: {
          description: 'Shared cost',
          payerId: ids[payer],
          amount,
          splitMode: 'custom',
          shares: [{ userId: ids[participant], amount }],
        },
      });
  const pay = (id: string) =>
    request(app)
      .post(`/api/groups/${id}/payments`)
      .set(auth('b'))
      .send({ requestId: randomUUID(), toId: ids.a, amount: 10000 });
  const respond = (id: string, action = 'confirm') =>
    request(app)
      .post(`/api/payments/${id}/respond`)
      .set(auth('a'))
      .send({ action });
  async function fixture(withMember = true) {
    const r = await request(app)
      .post('/api/groups')
      .set(auth('a'))
      .send({ name: 'Management test' });
    const id = r.body.group.id as string;
    const link = await invite(id);
    if (withMember) expect((await join(link.body.token)).status).toBe(200);
    return { id, link: link.body.token as string };
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
    for (const name of ['a', 'b', 'outsider']) {
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
        !database.startsWith('monivo_test_phase7_')
      )
        throw new Error('Refusing non-test database cleanup');
      await connection.dropDatabase();
      await connection.close();
    }
  });

  it('allows only an owner to rename and rejects injected fields or outsiders', async () => {
    const f = await fixture();
    expect(
      (await request(app).patch(`/api/groups/${f.id}`).send({ name: 'x' }))
        .status,
    ).toBe(401);
    expect((await rename(f.id, 'b')).status).toBe(403);
    expect((await rename(f.id, 'outsider')).status).toBe(404);
    for (const body of [
      { name: '' },
      { name: 'x', ownerId: ids.b },
      { name: 'x', memberIds: [] },
    ])
      expect(
        (
          await request(app)
            .patch(`/api/groups/${f.id}`)
            .set(auth('a'))
            .send(body)
        ).status,
      ).toBe(400);
    expect((await rename(f.id)).status).toBe(204);
    expect(
      (await request(app).get(`/api/groups/${f.id}`).set(auth('b'))).body.group
        .name,
    ).toBe('New name');
  });
  it('transfers ownership only to a current member and revokes previous invitations', async () => {
    const f = await fixture();
    expect((await transfer(f.id, 'b', 'b')).status).toBe(403);
    expect((await transfer(f.id, 'outsider')).status).toBe(400);
    expect((await transfer(f.id, 'a')).status).toBe(400);
    expect((await leave(f.id, 'a')).status).toBe(409);
    expect((await transfer(f.id)).status).toBe(204);
    expect((await join(f.link, 'outsider')).status).toBe(404);
    expect((await rename(f.id)).status).toBe(403);
    expect((await rename(f.id, 'b')).status).toBe(204);
    expect((await invite(f.id)).status).toBe(404);
    expect((await invite(f.id, 'b')).status).toBe(201);
    expect((await leave(f.id, 'a')).status).toBe(204);
  });
  it('blocks both debt and credit, then permits departure after receipt is confirmed', async () => {
    const f = await fixture();
    await expense(f.id);
    expect((await leave(f.id)).status).toBe(409);
    // Transfer ownership so the positive-balance member also reaches balance validation.
    await transfer(f.id);
    expect((await leave(f.id, 'a')).status).toBe(409);
    const p = await pay(f.id);
    expect((await leave(f.id, 'a')).status).toBe(409);
    await respond(p.body.payment.id);
    expect((await leave(f.id, 'a')).status).toBe(204);
    const view = await request(app).get(`/api/groups/${f.id}`).set(auth('b'));
    expect(view.body.group.formerMembers).toEqual([{ id: ids.a, name: 'a' }]);
  });
  it('blocks pending payments even if later expenses bring the net balance to zero', async () => {
    const f = await fixture();
    await expense(f.id);
    const p = await pay(f.id);
    await expense(f.id, 'b', 'a');
    expect((await leave(f.id)).status).toBe(409);
    await respond(p.body.payment.id, 'reject');
    expect((await leave(f.id)).status).toBe(204);
  });
  it('preserves named history, freezes affected expenses, revokes access, and supports explicit rejoining', async () => {
    const f = await fixture();
    const e = await expense(f.id);
    await expense(f.id, 'b', 'a');
    const results = await Promise.all([leave(f.id), leave(f.id)]);
    expect(results.every((r) => r.status === 204)).toBe(true);
    expect((await leave(f.id, 'outsider')).status).toBe(404);
    expect(
      (await request(app).get(`/api/groups/${f.id}`).set(auth('b'))).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/expenses/${e.body.expense.id}`)
          .set(auth('b'))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/groups/${f.id}/payment-recipient/${ids.a}`)
          .set(auth('b'))
      ).status,
    ).toBe(404);
    expect((await expense(f.id)).status).toBe(400);
    expect(
      (
        await request(app)
          .delete(`/api/expenses/${e.body.expense.id}`)
          .set(auth('a'))
          .send({ version: 1 })
      ).status,
    ).toBe(409);
    const ledger = (await request(app).get('/api/ledger').set(auth('a'))).body;
    expect(
      ledger.balances
        .find((g: { groupId: string }) => g.groupId === f.id)
        .members.find((m: { userId: string }) => m.userId === ids.b),
    ).toMatchObject({ name: 'b', amount: 0 });
    expect((await join(f.link)).status).toBe(404);
    const link = await invite(f.id);
    expect((await join(link.body.token)).status).toBe(200);
    const group = (await request(app).get(`/api/groups/${f.id}`).set(auth('b')))
      .body.group;
    expect(group.formerMembers).toEqual([]);
    expect(group.members).toHaveLength(2);
    expect(
      (
        await request(app)
          .get(`/api/expenses/${e.body.expense.id}`)
          .set(auth('b'))
      ).body.expense.locked,
    ).toBe(true);
  });
  it('closes a last-member group permanently while retaining its records', async () => {
    const f = await fixture(false);
    const e = await expense(f.id, 'a', 'a');
    expect(e.status).toBe(201);
    expect((await leave(f.id, 'a')).status).toBe(204);
    expect((await leave(f.id, 'a')).status).toBe(204);
    expect((await join(f.link, 'outsider')).status).toBe(404);
    const group = await modelsFor(connection).Group.findById(f.id);
    expect(group!.closedAt).toBeInstanceOf(Date);
    expect(group!.memberIds).toHaveLength(0);
    expect(
      await modelsFor(connection).Expense.countDocuments({ groupId: f.id }),
    ).toBe(1);
  });
  it('serializes departure with a new expense and preserves a zero departed balance', async () => {
    const f = await fixture();
    const [departure, cost] = await Promise.all([leave(f.id), expense(f.id)]);
    expect([
      [204, 400],
      [409, 201],
    ]).toContainEqual([departure.status, cost.status]);
    const group = await modelsFor(connection).Group.findById(f.id);
    expect(group!.memberIds.some((id) => id.toString() === ids.b)).toBe(
      departure.status !== 204,
    );
  });
  it('serializes departure with expense deletion and payment confirmation', async () => {
    const f = await fixture();
    const e = await expense(f.id);
    await expense(f.id, 'b', 'a');
    const [departure, removal] = await Promise.all([
      leave(f.id),
      request(app)
        .delete(`/api/expenses/${e.body.expense.id}`)
        .set(auth('a'))
        .send({ version: 1 }),
    ]);
    expect([
      [204, 409],
      [409, 204],
    ]).toContainEqual([departure.status, removal.status]);
    const other = await fixture();
    await expense(other.id);
    const p = await pay(other.id);
    const [left, confirmed] = await Promise.all([
      leave(other.id),
      respond(p.body.payment.id),
    ]);
    expect(confirmed.status).toBe(200);
    expect([204, 409]).toContain(left.status);
    if (left.status === 409) expect((await leave(other.id)).status).toBe(204);
  });
});
