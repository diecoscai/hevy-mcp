import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { startMcpServer } from './helpers/mcpClient.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function run(
  args: string[],
  opts: {
    env?: NodeJS.ProcessEnv;
    closeStdin?: boolean;
    timeoutMs?: number;
    onStarted?: (proc: ChildProcessWithoutNullStreams) => void;
  } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = opts.env ?? { PATH: process.env.PATH };
    const proc = spawn('node', ['dist/index.js', ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
      reject(new Error(`timed out after ${opts.timeoutMs ?? 10000}ms`));
    }, opts.timeoutMs ?? 10000);
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
    if (opts.onStarted) {
      opts.onStarted(proc);
    }
    if (opts.closeStdin) {
      proc.stdin.end();
    }
  });
}

describe('CLI dispatch', () => {
  const cleanEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH };

  it('--help prints usage and mentions setup', async () => {
    const { code, stdout } = await run(['--help'], { env: cleanEnv });
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
    expect(stdout).toContain('setup');
  });

  it('-h is a --help alias', async () => {
    const { code, stdout } = await run(['-h'], { env: cleanEnv });
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
    expect(stdout).toContain('setup');
  });

  it('--version prints <name>@<semver> matching package.json', async () => {
    const { code, stdout } = await run(['--version'], { env: cleanEnv });
    expect(code).toBe(0);
    const expected = `${pkg.name}@${pkg.version}`;
    expect(stdout.trim()).toBe(expected);
    expect(stdout).toMatch(/hevy-mcp@\d+\.\d+\.\d+/);
  });

  it('-v is a --version alias', async () => {
    const { code, stdout } = await run(['-v'], { env: cleanEnv });
    expect(code).toBe(0);
    expect(stdout).toMatch(/hevy-mcp@\d+\.\d+\.\d+/);
  });

  it('setup with no stdin and no env prints an instructional prompt, waits for input, and exits non-zero when killed', async () => {
    const result = await run(['setup'], {
      env: cleanEnv,
      timeoutMs: 10000,
      onStarted: (proc) => {
        // Wait for the prompt to appear, then kill the child to make it exit non-zero.
        let seen = '';
        const onData = (chunk: Buffer) => {
          seen += chunk.toString('utf8');
          if (seen.includes('API key (attempt')) {
            proc.stdout.off('data', onData);
            try {
              proc.kill('SIGTERM');
            } catch {}
          }
        };
        proc.stdout.on('data', onData);
      },
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain('hevy-mcp setup');
    expect(combined).toMatch(/hevy\.com\/settings\?developer/);
    expect(combined).toContain('API key (attempt');
    // Killed before answering → non-zero exit (either non-zero code or terminating signal).
    expect(result.code === 0 && result.signal === null).toBe(false);
  });

  it('default (no args, no HEVY_API_KEY, no config file) exits 1 with the setup hint on stderr', async () => {
    // Point XDG_CONFIG_HOME at an empty dir so there is definitely no config file.
    const emptyXdg = await (await import('node:fs/promises')).mkdtemp(
      (await import('node:path')).join((await import('node:os')).tmpdir(), 'hevy-mcp-cli-')
    );
    try {
      const { code, stderr } = await run([], {
        env: { PATH: process.env.PATH, XDG_CONFIG_HOME: emptyXdg, HOME: emptyXdg },
      });
      expect(code).toBe(1);
      expect(stderr).toContain('npx @diecoscai/hevy-mcp setup');
    } finally {
      await (await import('node:fs/promises')).rm(emptyXdg, { recursive: true, force: true });
    }
  });

  it('default with fake HEVY_API_KEY starts the MCP server and answers initialize on stdio', async () => {
    const client = startMcpServer({ HEVY_API_KEY: VALID_UUID });
    try {
      const initPromise = (async () => {
        const id = client.nextId();
        client.send({
          jsonrpc: '2.0',
          id,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'vitest-cli', version: '0' },
          },
        });
        return client.waitFor(id, 5000);
      })();

      const msg = await initPromise;
      expect(msg.error).toBeUndefined();
      expect(msg.result).toBeDefined();
    } finally {
      client.close();
    }
  });
});
