import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeClient,
  listTools,
  type McpClient,
  startMcpServer,
} from './helpers/mcpClient.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

const SEP986_TOOL_NAME = /^[a-zA-Z0-9_\-./]+$/;
const EXPECTED_TOOL_COUNT = 23;

describe('MCP schema conformance', () => {
  let client: McpClient;
  let tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;

  beforeAll(async () => {
    client = startMcpServer({ HEVY_API_KEY: 'test-key' });
    await initializeClient(client);
    tools = await listTools(client);
  }, 15000);

  afterAll(() => {
    client?.close();
  });

  it('advertises exactly 23 tools', () => {
    expect(tools.length).toBe(EXPECTED_TOOL_COUNT);
  });

  it('reads package name/version (package.json, not hardcoded)', () => {
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version.length).toBeGreaterThan(0);
    expect(pkg.name.length).toBeGreaterThan(0);
  });

  it('every tool name complies with SEP-986 (regex + length)', () => {
    for (const tool of tools) {
      expect(tool.name.length).toBeLessThanOrEqual(64);
      expect(tool.name).toMatch(SEP986_TOOL_NAME);
    }
  });

  it('every inputSchema compiles under ajv draft 2020-12 with ajv-formats', () => {
    const ajv = new (Ajv2020 as unknown as { default: typeof Ajv2020 }).default({ strict: false });
    (addFormats as unknown as { default: (a: unknown) => void }).default(ajv);
    for (const tool of tools) {
      expect(() => ajv.compile(tool.inputSchema), `failed to compile ${tool.name}`).not.toThrow();
    }
  });

  it('hevy_list_workouts.inputSchema caps pageSize at 10', () => {
    const tool = tools.find((t) => t.name === 'hevy_list_workouts');
    expect(tool).toBeDefined();
    const properties = (tool?.inputSchema as { properties: Record<string, { maximum?: number }> })
      .properties;
    expect(properties.pageSize.maximum).toBe(10);
  });

  it('hevy_list_exercise_templates.inputSchema caps pageSize at 100', () => {
    const tool = tools.find((t) => t.name === 'hevy_list_exercise_templates');
    expect(tool).toBeDefined();
    const properties = (tool?.inputSchema as { properties: Record<string, { maximum?: number }> })
      .properties;
    expect(properties.pageSize.maximum).toBe(100);
  });

  it('every tool description is English-only (no Spanish accented markers)', () => {
    const spanish = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
    for (const tool of tools) {
      expect(tool.description, tool.name).not.toMatch(spanish);
    }
  });
});
