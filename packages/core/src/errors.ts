export class SecoError extends Error {
  constructor(
    public readonly code:
      | 'SESSION_NOT_FOUND'
      | 'EXPERIENCE_NOT_FOUND'
      | 'INVALID_DRAFT'
      | 'INVALID_OBSIDIAN_PATH'
      | 'INVALID_OBSIDIAN_VAULT'
      | 'NO_EXPERIENCES'
      | 'OBSIDIAN_NOTE_EXISTS',
    public readonly detail: string
  ) {
    super(`${code}: ${detail}`);
    this.name = 'SecoError';
  }
}
