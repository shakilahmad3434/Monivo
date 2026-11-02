import { randomBytes } from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { modelsFor } from '../../src/modules/models.js';

describe('UPI profile and member-only payment details', () => {
  const database = `monivo_test_phase6_${randomBytes(8).toString('hex')}`;
  let connection: Connection;
  let app: ReturnType<typeof createApp>;
  const tokens: Record<string, string> = {},
    ids: Record<string, string> = {};
  let groupId: string;
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
        name: sub,
        email: `${sub}@example.com`,
      }),
    });
    for (const name of ['a', 'b', 'outsider']) {
      const r = await request(app)
        .post('/api/auth/google')
        .send({ idToken: name });
      tokens[name] = r.body.token;
      ids[name] = r.body.user.id;
      expect(r.body.user.upiId).toBeNull();
    }
    const g = await request(app)
      .post('/api/groups')
      .set(auth('a'))
      .send({ name: 'UPI test' });
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
        !database.startsWith('monivo_test_phase6_')
      )
        throw new Error('Refusing non-test database cleanup');
      await connection.dropDatabase();
      await connection.close();
    }
  });
  it('validates, normalizes, persists and removes only the signed-in user’s UPI ID', async () => {
    expect(
      (
        await request(app)
          .patch('/api/me')
          .set(auth('a'))
          .send({ name: 'A', upiId: 'bad&pa=other@bank' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch('/api/me')
          .set(auth('a'))
          .send({ name: 'A', upiId: 'a@bank', id: ids.b })
      ).status,
    ).toBe(400);
    const saved = await request(app)
      .patch('/api/me')
      .set(auth('a'))
      .send({ name: 'A', upiId: ' A.Test@BANK ' });
    expect(saved.body.user.upiId).toBe('a.test@bank');
    expect(
      (await request(app).get('/api/me').set(auth('b'))).body.user.upiId,
    ).toBeNull();
    await request(app)
      .patch('/api/me')
      .set(auth('a'))
      .send({ name: 'A renamed' });
    expect(
      (await request(app).get('/api/me').set(auth('a'))).body.user.upiId,
    ).toBe('a.test@bank');
    const login = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'a' });
    expect(login.body.user.upiId).toBe('a.test@bank');
  });
  it('exposes recipient details only inside a shared group, without emails or financial writes', async () => {
    const path = `/api/groups/${groupId}/payment-recipient/${ids.a}`;
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).set(auth('outsider'))).status).toBe(
      404,
    );
    expect(
      (
        await request(app)
          .get(`/api/groups/${groupId}/payment-recipient/${ids.outsider}`)
          .set(auth('a'))
      ).status,
    ).toBe(404);
    const result = await request(app).get(path).set(auth('b'));
    expect(result.body.recipient).toEqual({
      id: ids.a,
      name: 'A renamed',
      upiId: 'a.test@bank',
    });
    const group = await request(app)
      .get(`/api/groups/${groupId}`)
      .set(auth('b'));
    expect(
      group.body.group.members.some(
        (m: object) => 'upiId' in m || 'email' in m,
      ),
    ).toBe(false);
    const ledger = await request(app).get('/api/ledger').set(auth('b'));
    expect(ledger.body.payments).toEqual([]);
    expect(
      ledger.body.balances[0].members.some((m: object) => 'upiId' in m),
    ).toBe(false);
    expect(await modelsFor(connection).Payment.countDocuments()).toBe(0);
  });
  it('reflects address changes/removal immediately without altering old payment state', async () => {
    await request(app)
      .patch('/api/me')
      .set(auth('a'))
      .send({ name: 'A renamed', upiId: 'new@bank' });
    const path = `/api/groups/${groupId}/payment-recipient/${ids.a}`;
    expect(
      (await request(app).get(path).set(auth('b'))).body.recipient.upiId,
    ).toBe('new@bank');
    await request(app)
      .patch('/api/me')
      .set(auth('a'))
      .send({ name: 'A renamed', upiId: null });
    expect(
      (await request(app).get(path).set(auth('b'))).body.recipient.upiId,
    ).toBeNull();
  });
});
