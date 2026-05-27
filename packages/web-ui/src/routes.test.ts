import { describe, expect, it } from 'vitest';
import { sessionIdFromPath } from './routes';

describe('sessionIdFromPath', () => {
  it('extracts encoded session ids from session routes', () => {
    expect(sessionIdFromPath('/session/abc-123')).toBe('abc-123');
    expect(sessionIdFromPath('/session/a%20b')).toBe('a b');
  });

  it('returns null for non-session routes', () => {
    expect(sessionIdFromPath('/')).toBeNull();
    expect(sessionIdFromPath('/session')).toBeNull();
  });
});
