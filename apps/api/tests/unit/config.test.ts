import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config.js';

describe('Environment validation', () => {
  it('rejects missing database configuration and invalid ports without leaking secrets', () => {
    expect(() => parseEnvironment({})).toThrow('MONGODB_URI');
    expect(() =>
      parseEnvironment({ MONGODB_URI: 'mongodb://localhost/test', PORT: '0' }),
    ).toThrow('PORT');
    expect(() => parseEnvironment({ MONGODB_URI: 'secret-value' })).toThrow(
      'Invalid environment variables: MONGODB_URI',
    );
  });
});
