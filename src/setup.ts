import { mkdir, stat, writeFile } from 'node:fs/promises';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { configDir, configPath, isValidApiKey, readStoredConfig } from './config.js';

export interface SetupIO {
  question(prompt: string): Promise<string>;
  info(line: string): void;
  error(line: string): void;
  close(): void;
}

export interface ApiProbeResult {
  ok: boolean;
  status: number;
  user?: { id?: string; username?: string };
  errorText?: string;
}

export type ApiProbe = (apiKey: string) => Promise<ApiProbeResult>;

const KEY_URL = 'https://hevy.com/settings?developer';
const USER_INFO_URL = 'https://api.hevyapp.com/v1/user/info';
const MAX_ATTEMPTS = 3;

export function createReadlineIO(): SetupIO {
  const rl = readline.createInterface({ input, output });
  return {
    question: (prompt) => rl.question(prompt),
    info: (line) => output.write(`${line}\n`),
    error: (line) => process.stderr.write(`${line}\n`),
    close: () => rl.close(),
  };
}

export const defaultApiProbe: ApiProbe = async (apiKey) => {
  try {
    const res = await fetch(USER_INFO_URL, {
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, errorText: text };
    }
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const record = (parsed ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      status: res.status,
      user: {
        id: typeof record.id === 'string' ? record.id : undefined,
        username: typeof record.username === 'string' ? record.username : undefined,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorText: err instanceof Error ? err.message : String(err),
    };
  }
};

export interface RunSetupOptions {
  io?: SetupIO;
  probe?: ApiProbe;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export async function runSetup(opts: RunSetupOptions = {}): Promise<number> {
  const io = opts.io ?? createReadlineIO();
  const probe = opts.probe ?? defaultApiProbe;
  const env = opts.env ?? process.env;
  const now = opts.now ?? (() => new Date());

  try {
    io.info('hevy-mcp setup');
    io.info(`Get your Hevy Pro API key at: ${KEY_URL}`);
    io.info('Paste the key below (input is trimmed; UUID v4 expected).');
    io.info('');

    const existing = await readStoredConfig(env);
    if (existing) {
      const who = existing.username ? ` (user: ${existing.username})` : '';
      io.info(`A config file already exists${who}.`);
      const answer = (await io.question('Replace it? [y/N] ')).trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') {
        io.info('Aborted. Existing config kept.');
        return 0;
      }
    }

    let validatedKey: string | null = null;
    let user: ApiProbeResult['user'];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const raw = await io.question(`API key (attempt ${attempt}/${MAX_ATTEMPTS}): `);
      const key = raw.trim();
      if (!isValidApiKey(key)) {
        io.error('Invalid format. Expected a UUID v4 (e.g. 123e4567-e89b-42d3-a456-426614174000).');
        continue;
      }
      const result = await probe(key);
      if (result.ok) {
        validatedKey = key;
        user = result.user;
        break;
      }
      if (result.status === 401 || result.status === 403) {
        io.error(`Hevy rejected that key (HTTP ${result.status}). Double-check it and retry.`);
      } else if (result.status === 0) {
        io.error(`Could not reach Hevy: ${result.errorText ?? 'network error'}.`);
      } else {
        io.error(`Hevy returned HTTP ${result.status}. ${result.errorText ?? ''}`.trim());
      }
    }

    if (!validatedKey) {
      io.error(`Setup failed after ${MAX_ATTEMPTS} attempts.`);
      return 1;
    }

    const dir = configDir(env);
    const file = configPath(env);
    await ensureDir(dir);
    const payload = {
      api_key: validatedKey,
      user_id: user?.id,
      username: user?.username,
      created_at: now().toISOString(),
    };
    await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });

    io.info('');
    io.info(`Saved ${file} (mode 0600).`);
    io.info('Next steps:');
    io.info('  1. Add hevy-mcp to your MCP client config (e.g. Claude Desktop).');
    io.info('  2. Command: npx -y @diecoscai/hevy-mcp');
    io.info('  3. No env vars are required — the config file is read automatically.');
    io.info('  4. To allow writes (POST/PUT), set HEVY_MCP_ALLOW_WRITES=1 for the client.');
    io.info('  5. Restart the client so it picks up the new server.');
    io.info('  6. Ask the assistant to call hevy_get_user_info to verify.');
    return 0;
  } finally {
    io.close();
  }
}

async function ensureDir(dir: string): Promise<void> {
  try {
    const s = await stat(dir);
    if (s.isDirectory()) return;
  } catch {
    // fall through and create
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
}
