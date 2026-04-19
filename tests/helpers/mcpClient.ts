import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpClient {
  proc: ChildProcessWithoutNullStreams;
  send: (msg: JsonRpcMessage) => void;
  nextId: () => number;
  waitFor: (id: number, timeoutMs?: number) => Promise<JsonRpcMessage>;
  close: () => void;
}

export interface StartOptions {
  env?: NodeJS.ProcessEnv;
  preload?: string;
  fixtures?: Array<{
    method: 'GET' | 'POST' | 'PUT';
    pathRegex: string;
    status: number;
    body: unknown;
  }>;
}

export function startMcpServer(opts: StartOptions | NodeJS.ProcessEnv = {}): McpClient {
  const options: StartOptions =
    'env' in opts || 'preload' in opts || 'fixtures' in opts
      ? (opts as StartOptions)
      : { env: opts as NodeJS.ProcessEnv };
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...options.env };
  if (options.fixtures) {
    childEnv.HEVY_TEST_FIXTURES = JSON.stringify(options.fixtures);
  }
  if (options.preload) {
    const existing = childEnv.NODE_OPTIONS ? `${childEnv.NODE_OPTIONS} ` : '';
    childEnv.NODE_OPTIONS = `${existing}--import=${options.preload}`;
  }
  const proc = spawn('node', ['dist/index.js'], {
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map<
    number | string,
    { resolve: (msg: JsonRpcMessage) => void; reject: (err: Error) => void }
  >();
  let buf = '';
  let idCounter = 1;
  let exited = false;

  proc.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(trimmed) as JsonRpcMessage;
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const resolver = pending.get(msg.id);
        pending.delete(msg.id);
        resolver?.resolve(msg);
      }
    }
  });

  proc.stderr.on('data', () => {});
  proc.on('exit', () => {
    exited = true;
    for (const { reject } of pending.values()) {
      reject(new Error('server process exited before response'));
    }
    pending.clear();
  });

  function send(msg: JsonRpcMessage) {
    if (exited) throw new Error('server process already exited');
    proc.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  function nextId() {
    idCounter += 1;
    return idCounter;
  }

  function waitFor(id: number, timeoutMs = 10000): Promise<JsonRpcMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for response id=${id}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  function close() {
    if (!exited) {
      try {
        proc.kill('SIGTERM');
      } catch {}
    }
  }

  return { proc, send, nextId, waitFor, close };
}

export async function initializeClient(client: McpClient): Promise<void> {
  const initId = client.nextId();
  client.send({
    jsonrpc: '2.0',
    id: initId,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'vitest', version: '0' },
    },
  });
  await client.waitFor(initId);
  client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

export async function listTools(client: McpClient): Promise<
  Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
> {
  const id = client.nextId();
  client.send({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });
  const msg = await client.waitFor(id);
  const result = msg.result as {
    tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  };
  return result.tools;
}

export async function callTool(
  client: McpClient,
  name: string,
  args: Record<string, unknown>
): Promise<{
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}> {
  const id = client.nextId();
  client.send({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const msg = await client.waitFor(id);
  return msg.result as {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  };
}
