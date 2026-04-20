export class MissingCredentialsError extends Error {
  readonly code = 'MISSING_CREDENTIALS';
  constructor(message?: string) {
    super(
      message ??
        'No Hevy API key found. Set the HEVY_API_KEY environment variable to a key from https://hevy.com/settings?developer.'
    );
    this.name = 'MissingCredentialsError';
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidApiKey(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value.trim());
}

export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.HEVY_API_KEY;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new MissingCredentialsError();
  }
  return raw.trim();
}
