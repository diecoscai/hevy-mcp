import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configPath } from '../src/config.js';
import { type ApiProbe, runSetup, type SetupIO } from '../src/setup.js';

const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';
const VALID_UUID_3 = '33333333-3333-4333-8333-333333333333';
const SEED_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function makeIO(answers: string[]): SetupIO & {
  infoLines: string[];
  errorLines: string[];
  questionCalls: string[];
  closed: boolean;
} {
  const infoLines: string[] = [];
  const errorLines: string[] = [];
  const questionCalls: string[] = [];
  let i = 0;
  return {
    infoLines,
    errorLines,
    questionCalls,
    closed: false,
    question(prompt: string) {
      questionCalls.push(prompt);
      const answer = answers[i] ?? '';
      i += 1;
      return Promise.resolve(answer);
    },
    info(line: string) {
      infoLines.push(line);
    },
    error(line: string) {
      errorLines.push(line);
    },
    close() {
      this.closed = true;
    },
  };
}

describe('runSetup', () => {
  let tempRoot: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'hevy-mcp-setup-'));
    env = { XDG_CONFIG_HOME: tempRoot };
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('happy path: writes config with correct shape, mode 0600, dir 0700', async () => {
    const io = makeIO([VALID_UUID_1]);
    const probe: ApiProbe = vi.fn(async () => ({
      ok: true,
      status: 200,
      user: { id: 'user-42', username: 'diego' },
    }));
    const fixedNow = new Date('2026-04-19T12:00:00.000Z');

    const code = await runSetup({
      io,
      probe,
      env,
      now: () => fixedNow,
    });

    expect(code).toBe(0);
    const filePath = configPath(env);
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.api_key).toBe(VALID_UUID_1);
    expect(parsed.user_id).toBe('user-42');
    expect(parsed.username).toBe('diego');
    expect(parsed.created_at).toBe(fixedNow.toISOString());

    const fileStat = await stat(filePath);
    expect(fileStat.mode & 0o777).toBe(0o600);

    const dirStat = await stat(join(tempRoot, 'hevy-mcp'));
    expect(dirStat.mode & 0o777).toBe(0o700);

    expect(io.closed).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('invalid key retries: probe fails twice with 401, succeeds on third', async () => {
    const io = makeIO([VALID_UUID_1, VALID_UUID_2, VALID_UUID_3]);
    const probe: ApiProbe = vi
      .fn<ApiProbe>()
      .mockResolvedValueOnce({ ok: false, status: 401, errorText: 'unauthorized' })
      .mockResolvedValueOnce({ ok: false, status: 401, errorText: 'unauthorized' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        user: { id: 'user-99', username: 'third' },
      });

    const code = await runSetup({ io, probe, env, now: () => new Date() });

    expect(code).toBe(0);
    expect(probe).toHaveBeenCalledTimes(3);
    const raw = await readFile(configPath(env), 'utf8');
    expect(JSON.parse(raw).api_key).toBe(VALID_UUID_3);
  });

  it('three consecutive 401s: non-zero exit code, no file written', async () => {
    const io = makeIO([VALID_UUID_1, VALID_UUID_2, VALID_UUID_3]);
    const probe: ApiProbe = vi
      .fn<ApiProbe>()
      .mockResolvedValue({ ok: false, status: 401, errorText: 'unauthorized' });

    const code = await runSetup({ io, probe, env, now: () => new Date() });

    expect(code).not.toBe(0);
    expect(probe).toHaveBeenCalledTimes(3);
    await expect(stat(configPath(env))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('existing config, user declines overwrite (answer "n"): exit 0, file unchanged', async () => {
    const dir = join(tempRoot, 'hevy-mcp');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const seeded = {
      api_key: SEED_UUID,
      user_id: 'old-user',
      username: 'olduser',
      created_at: '2025-01-01T00:00:00.000Z',
    };
    const filePath = configPath(env);
    await writeFile(filePath, JSON.stringify(seeded, null, 2), { mode: 0o600 });
    const before = await readFile(filePath, 'utf8');

    const io = makeIO(['n']);
    const probe: ApiProbe = vi.fn<ApiProbe>().mockResolvedValue({
      ok: true,
      status: 200,
      user: { id: 'new', username: 'new' },
    });

    const code = await runSetup({ io, probe, env, now: () => new Date() });

    expect(code).toBe(0);
    expect(probe).not.toHaveBeenCalled();
    const after = await readFile(filePath, 'utf8');
    expect(after).toBe(before);
  });

  it('existing config, user accepts overwrite with "y": file updated', async () => {
    const dir = join(tempRoot, 'hevy-mcp');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const filePath = configPath(env);
    await writeFile(
      filePath,
      JSON.stringify({ api_key: SEED_UUID, username: 'olduser' }, null, 2),
      { mode: 0o600 }
    );

    const io = makeIO(['y', VALID_UUID_1]);
    const probe: ApiProbe = vi.fn<ApiProbe>().mockResolvedValue({
      ok: true,
      status: 200,
      user: { id: 'new', username: 'newuser' },
    });

    const code = await runSetup({ io, probe, env, now: () => new Date() });

    expect(code).toBe(0);
    const after = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
    expect(after.api_key).toBe(VALID_UUID_1);
    expect(after.username).toBe('newuser');
  });

  it('trims whitespace-only input and continues to prompt until a valid key is entered', async () => {
    const io = makeIO(['   ', VALID_UUID_1]);
    const probe: ApiProbe = vi.fn<ApiProbe>().mockResolvedValue({
      ok: true,
      status: 200,
      user: { id: 'u', username: 'u' },
    });

    const code = await runSetup({ io, probe, env, now: () => new Date() });

    expect(code).toBe(0);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(VALID_UUID_1);
    expect(io.errorLines.some((l) => l.toLowerCase().includes('invalid format'))).toBe(true);
  });

  it('closes the IO even on failure path', async () => {
    const io = makeIO([VALID_UUID_1, VALID_UUID_2, VALID_UUID_3]);
    const probe: ApiProbe = vi.fn<ApiProbe>().mockResolvedValue({
      ok: false,
      status: 401,
      errorText: 'nope',
    });

    await runSetup({ io, probe, env, now: () => new Date() });

    expect(io.closed).toBe(true);
  });
});
