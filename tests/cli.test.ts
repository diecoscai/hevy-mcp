import { spawn } from 'node:child_process';
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
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
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
    proc.stdin.end();
  });
}

describe('CLI dispatch', () => {
  const cleanEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH };

  it('--help prints usage and explains authentication', async () => {
    const { code, stdout } = await run(['--help'], { env: cleanEnv });
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
    expect(stdout).toContain('HEVY_API_KEY');
  });

  it('-h is a --help alias', async () => {
    const { code, stdout } = await run(['-h'], { env: cleanEnv });
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
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

  it('unknown argument prints usage and exits 2', async () => {
    const { code, stdout, stderr } = await run(['wat'], { env: cleanEnv });
    expect(code).toBe(2);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).toContain('Unknown argument');
    expect(combined).toContain('Usage');
  });

  it('default (no args, no HEVY_API_KEY) exits 1 with a clear message pointing at HEVY_API_KEY', async () => {
    const { code, stderr } = await run([], { env: cleanEnv });
    expect(code).toBe(1);
    expect(stderr).toContain('HEVY_API_KEY');
    expect(stderr).toContain('hevy.com/settings?developer');
  });

  it('default with fake HEVY_API_KEY starts the MCP server and answers initialize on stdio', async () => {
    const client = startMcpServer({ HEVY_API_KEY: VALID_UUID });
    try {
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
      const msg = await client.waitFor(id, 5000);
      expect(msg.error).toBeUndefined();
      expect(msg.result).toBeDefined();
    } finally {
      client.close();
    }
  });
});
