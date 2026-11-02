import { OAuth2Client } from 'google-auth-library';
import { ApiError } from './errors.js';

export type GoogleIdentity = { sub: string; email: string; name: string };
export type VerifyGoogleToken = (idToken: string) => Promise<GoogleIdentity>;

export function googleVerifier(
  clientId: string | undefined,
): VerifyGoogleToken {
  const client = new OAuth2Client();
  return async (idToken) => {
    if (!clientId)
      throw new ApiError(503, 'Google sign-in is not configured yet.');
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true)
        throw new Error('Invalid identity');
      return {
        sub: payload.sub,
        email: payload.email,
        name: (
          payload.name ||
          payload.email.split('@')[0] ||
          'Monivo member'
        ).slice(0, 50),
      };
    } catch {
      throw new ApiError(
        401,
        'Google sign-in could not be verified. Please sign in again.',
      );
    }
  };
}
