import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('API readiness', () => {
  it('changes readiness when database connectivity changes without losing liveness', async () => {
    let connected = true;
    const app = createApp(() => connected);
    const ready = await request(app).get('/health');
    expect(ready.status).toBe(200);
    expect(ready.body.database).toBe('connected');
    connected = false;
    expect((await request(app).get('/health/ready')).status).toBe(503);
    expect((await request(app).get('/health/live')).status).toBe(200);
  });
});
