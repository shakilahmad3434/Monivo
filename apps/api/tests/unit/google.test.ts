import {
  LoginTicket,
  OAuth2Client,
  type TokenPayload,
} from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleVerifier } from '../../src/modules/google.js';

afterEach(() => vi.restoreAllMocks());
const audience = 'monivo-test.apps.googleusercontent.com';
const claims: TokenPayload = {
  iss: 'https://accounts.google.com',
  aud: audience,
  sub: 'google-sub',
  email: 'friend@example.com',
  email_verified: true,
  name: 'Friend',
  iat: 1,
  exp: 2,
};
describe('Google identity boundary', () => {
  it('fails closed before making a request when OAuth is not configured', async () => {
    await expect(googleVerifier(undefined)('token')).rejects.toMatchObject({
      status: 503,
    });
  });
  it('delegates cryptographic and audience verification to the Google library', async () => {
    const verify = vi
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(async () => new LoginTicket(undefined, claims));
    await expect(googleVerifier(audience)('google-id-token')).resolves.toEqual({
      sub: 'google-sub',
      email: 'friend@example.com',
      name: 'Friend',
    });
    expect(verify).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience,
    });
  });
  it('rejects unverified email claims and invalid tokens', async () => {
    const verify = vi
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(
        async () =>
          new LoginTicket(undefined, { ...claims, email_verified: false }),
      );
    await expect(googleVerifier(audience)('token')).rejects.toMatchObject({
      status: 401,
    });
    verify.mockImplementation(async () => {
      throw new Error('token expired');
    });
    await expect(googleVerifier(audience)('token')).rejects.toMatchObject({
      status: 401,
    });
  });
});
