import { randomBytes } from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { modelsFor } from '../../src/modules/models.js';
import { ApiError } from '../../src/modules/errors.js';

describe('Accounts and group authorization (isolated Docker MongoDB)', () => {
  let connection: Connection;
  let app: ReturnType<typeof createApp>;
  let owner = '';
  let friend = '';
  let outsider = '';
  let groupId = '';
  let invitation = '';
  const databaseName = `monivo_test_phase3_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    connection = await mongoose
      .createConnection(
        process.env.TEST_MONGODB_URI ??
          'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true',
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    await Promise.all(
      Object.values(modelsFor(connection)).map((model) => model.init()),
    );
    app = createApp(() => connection.readyState === 1, {
      connection,
      verifyGoogleToken: async (idToken) => {
        if (!['owner', 'friend', 'outsider'].includes(idToken))
          throw new ApiError(401, 'Invalid Google token.');
        return { sub: idToken, email: `${idToken}@example.com`, name: idToken };
      },
    });
    for (const name of ['owner', 'friend', 'outsider']) {
      const response = await request(app)
        .post('/api/auth/google')
        .send({ idToken: name });
      expect(response.status).toBe(200);
      if (name === 'owner') owner = response.body.token;
      if (name === 'friend') friend = response.body.token;
      if (name === 'outsider') outsider = response.body.token;
    }
  }, 15000);
  afterAll(async () => {
    if (connection) {
      // This connection always overrides dbName to a unique test-only database.
      if (
        connection.name !== databaseName ||
        !databaseName.startsWith('monivo_test_phase3_')
      )
        throw new Error('Refusing to drop a non-test database');
      await connection.dropDatabase();
      await connection.close();
    }
  });

  it('rejects unauthenticated and invalid identity requests', async () => {
    expect((await request(app).get('/api/groups')).status).toBe(401);
    expect(
      (await request(app).post('/api/auth/google').send({ idToken: 'forged' }))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/me')
          .auth('a'.repeat(64), { type: 'bearer' })
      ).status,
    ).toBe(401);
  });
  it('keeps a stable account across sign-ins and allows only its profile to change', async () => {
    const original = await request(app)
      .get('/api/me')
      .auth(owner, { type: 'bearer' });
    const again = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'owner' });
    expect(again.body.user.id).toBe(original.body.user.id);
    expect(
      (
        await request(app)
          .patch('/api/me')
          .auth(owner, { type: 'bearer' })
          .send({ name: 'Owner updated', id: again.body.user.id })
      ).status,
    ).toBe(400);
    const update = await request(app)
      .patch('/api/me')
      .auth(owner, { type: 'bearer' })
      .send({ name: 'Owner updated' });
    expect(update.body.user.name).toBe('Owner updated');
    const { Session } = modelsFor(connection);
    expect(await Session.findOne({ tokenHash: owner })).toBeNull();
  });
  it('creates an owner-only group and rejects injected membership', async () => {
    const forged = await request(app)
      .post('/api/groups')
      .auth(owner, { type: 'bearer' })
      .send({ name: 'Flatmates', memberIds: ['outsider'] });
    expect(forged.status).toBe(400);
    const response = await request(app)
      .post('/api/groups')
      .auth(owner, { type: 'bearer' })
      .send({ name: 'Flatmates', kind: 'home' });
    expect(response.status).toBe(201);
    groupId = response.body.group.id;
    expect(response.body.group.members).toHaveLength(1);
    expect(response.body.group.members[0]).not.toHaveProperty('email');
    expect(
      (
        await request(app)
          .get(`/api/groups/${groupId}`)
          .auth(friend, { type: 'bearer' })
      ).status,
    ).toBe(404);
  });
  it('requires authentication to preview/join and adds a registered member once', async () => {
    const invite = await request(app)
      .post(`/api/groups/${groupId}/invite`)
      .auth(owner, { type: 'bearer' });
    expect(invite.status).toBe(201);
    invitation = invite.body.token;
    expect(
      (await request(app).get(`/api/invitations/${invitation}`)).status,
    ).toBe(401);
    expect(
      (await request(app).post(`/api/invitations/${invitation}/join`)).status,
    ).toBe(401);
    const preview = await request(app)
      .get(`/api/invitations/${invitation}`)
      .auth(friend, { type: 'bearer' });
    expect(preview.body.groupName).toBe('Flatmates');
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post(`/api/invitations/${invitation}/join`)
          .auth(friend, { type: 'bearer' }),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const group = await request(app)
      .get(`/api/groups/${groupId}`)
      .auth(friend, { type: 'bearer' });
    expect(group.body.group.members).toHaveLength(2);
    expect(
      (
        await request(app)
          .post(`/api/groups/${groupId}/invite`)
          .auth(friend, { type: 'bearer' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/groups/${groupId}/invite`)
          .auth(friend, { type: 'bearer' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/groups/${groupId}`)
          .auth(outsider, { type: 'bearer' })
      ).status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/groups').auth(outsider, { type: 'bearer' }))
        .body.groups,
    ).toEqual([]);
  });
  it('expires, replaces, and revokes invitations without removing existing members', async () => {
    const { Group } = modelsFor(connection);
    await Group.updateOne(
      { _id: groupId },
      { inviteExpiresAt: new Date(Date.now() - 1000) },
    );
    expect(
      (
        await request(app)
          .post(`/api/invitations/${invitation}/join`)
          .auth(outsider, { type: 'bearer' })
      ).status,
    ).toBe(404);
    const next = await request(app)
      .post(`/api/groups/${groupId}/invite`)
      .auth(owner, { type: 'bearer' });
    expect(
      (
        await request(app)
          .get(`/api/invitations/${invitation}`)
          .auth(friend, { type: 'bearer' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/invitations/${next.body.token}`)
          .auth(friend, { type: 'bearer' })
      ).status,
    ).toBe(200);
    await request(app)
      .delete(`/api/groups/${groupId}/invite`)
      .auth(owner, { type: 'bearer' });
    expect(
      (
        await request(app)
          .get(`/api/invitations/${next.body.token}`)
          .auth(friend, { type: 'bearer' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/groups/${groupId}`)
          .auth(friend, { type: 'bearer' })
      ).status,
    ).toBe(200);
  });
  it('checks session expiry before MongoDB TTL cleanup and revokes logout sessions', async () => {
    const login = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'outsider' });
    const { Session } = modelsFor(connection);
    await Session.updateMany(
      { userId: login.body.user.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    expect(
      (
        await request(app)
          .get('/api/me')
          .auth(login.body.token, { type: 'bearer' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/logout')
          .auth(friend, { type: 'bearer' })
      ).status,
    ).toBe(204);
    expect(
      (await request(app).get('/api/me').auth(friend, { type: 'bearer' }))
        .status,
    ).toBe(401);
  });
});
