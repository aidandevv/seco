export class SecoError extends Error {
  constructor(
    public readonly code: 'SESSION_NOT_FOUND' | 'EXPERIENCE_NOT_FOUND' | 'INVALID_DRAFT',
    public readonly detail: string
  ) {
    super(`${code}: ${detail}`);
    this.name = 'SecoError';
  }
}
