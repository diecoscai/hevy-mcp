import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  callTool,
  initializeClient,
  listTools,
  type McpClient,
  startMcpServer,
} from '../helpers/mcpClient.js';

// Live-read smoke tests against api.hevyapp.com. Entire suite is skipped
// when HEVY_API_KEY is not provided. No writes are performed.

describe.skipIf(!process.env.HEVY_API_KEY)(
  'Hevy live integration (read-only)',
  () => {
    let client: McpClient;

    beforeAll(async () => {
      client = startMcpServer({ env: { HEVY_API_KEY: process.env.HEVY_API_KEY } });
      await initializeClient(client);
    }, 20000);

    afterAll(() => {
      client?.close();
    });

    it('tools/list returns 22 tools', async () => {
      const tools = await listTools(client);
      expect(tools.length).toBe(22);
    });

    it('hevy_get_user_info returns a non-empty id and name', async () => {
      const result = await callTool(client, 'hevy_get_user_info', {});
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as {
        data?: { id?: string; name?: string };
        id?: string;
        name?: string;
      };
      // accept either envelope shape — Hevy returns { data: { id, name, url } }
      const user = parsed.data ?? parsed;
      expect(typeof user.id).toBe('string');
      expect((user.id ?? '').length).toBeGreaterThan(0);
      expect(typeof user.name).toBe('string');
      expect((user.name ?? '').length).toBeGreaterThan(0);
    });

    it('hevy_get_workout_count returns a number', async () => {
      const result = await callTool(client, 'hevy_get_workout_count', {});
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as {
        workout_count?: number;
      };
      expect(typeof parsed.workout_count).toBe('number');
    });

    it('hevy_list_workouts with pageSize 2 returns at most 2 workouts', async () => {
      const result = await callTool(client, 'hevy_list_workouts', { pageSize: 2 });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as {
        page: number;
        page_count: number;
        workouts: unknown[];
      };
      expect(typeof parsed.page).toBe('number');
      expect(Array.isArray(parsed.workouts)).toBe(true);
      expect(parsed.workouts.length).toBeLessThanOrEqual(2);
    });

    it('hevy_list_exercise_templates with pageSize 5 returns at most 5 templates', async () => {
      const result = await callTool(client, 'hevy_list_exercise_templates', {
        pageSize: 5,
      });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as {
        exercise_templates: unknown[];
      };
      expect(Array.isArray(parsed.exercise_templates)).toBe(true);
      expect(parsed.exercise_templates.length).toBeLessThanOrEqual(5);
    });
  }
);
