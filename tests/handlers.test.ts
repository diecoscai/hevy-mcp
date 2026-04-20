import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { callTool, initializeClient, type McpClient, startMcpServer } from './helpers/mcpClient.js';

const PRELOAD = fileURLToPath(new URL('./helpers/nockPreload.mjs', import.meta.url));
const VALID_WORKOUT_UUID = '11111111-1111-4111-8111-111111111111';
const BUILT_IN_TEMPLATE_ID = '79D0BB3A';

// We drive the real MCP server as a subprocess (src/index.ts spawns a stdio
// transport and main() at import, so in-process testing is impractical without
// touching src/). The subprocess boots with NODE_OPTIONS=--import=<preload>
// which installs nock fixtures for api.hevyapp.com before any fetch() runs.

describe('tool handlers via mocked fetch (subprocess + nock preload)', () => {
  let client: McpClient | undefined;

  afterEach(() => {
    client?.close();
    client = undefined;
  });

  it('hevy_get_user_info returns mocked upstream body', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/user/info$',
          status: 200,
          body: { id: 'u1', name: 'Diego', url: 'https://hevy.com/diego' },
        },
      ],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_get_user_info', {});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as {
      id: string;
      name: string;
      url: string;
    };
    expect(parsed.id).toBe('u1');
    expect(parsed.name).toBe('Diego');
  });

  it('hevy_get_workout with valid UUID returns mocked body', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: `^/v1/workouts/${VALID_WORKOUT_UUID}$`,
          status: 200,
          body: { id: VALID_WORKOUT_UUID, title: 'Morning' },
        },
      ],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_get_workout', {
      workoutId: VALID_WORKOUT_UUID,
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as { id: string; title: string };
    expect(parsed.title).toBe('Morning');
  });

  it('hevy_get_workout maps upstream 404 into UPSTREAM_ERROR', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: `^/v1/workouts/${VALID_WORKOUT_UUID}$`,
          status: 404,
          body: { error: 'not found' },
        },
      ],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_get_workout', {
      workoutId: VALID_WORKOUT_UUID,
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text) as {
      error_code: string;
      details: { status: number };
    };
    expect(payload.error_code).toBe('UPSTREAM_ERROR');
    expect(payload.details.status).toBe(404);
  });

  it('hevy_list_workouts forwards page=1&pageSize=5 to upstream', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          // must include page=1 and pageSize=5 in any order
          pathRegex: '^/v1/workouts\\?(?=.*\\bpage=1\\b)(?=.*\\bpageSize=5\\b)',
          status: 200,
          body: { page: 1, page_count: 1, workouts: [] },
        },
      ],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_list_workouts', { pageSize: 5 });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as {
      page: number;
      workouts: unknown[];
    };
    expect(parsed.page).toBe(1);
    expect(parsed.workouts).toEqual([]);
  });

  it('hevy_create_workout returns dry_run when HEVY_MCP_ALLOW_WRITES is unset', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      // fixtures set but with nock.disableNetConnect — if the handler
      // erroneously calls fetch, the test will fail with a Nock NetConnect
      // error surfaced as UPSTREAM_ERROR.
      fixtures: [],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_create_workout', {
      workout: {
        title: 'Dry run',
        start_time: '2026-04-19T08:00:00Z',
        end_time: '2026-04-19T09:00:00Z',
        exercises: [
          {
            exercise_template_id: BUILT_IN_TEMPLATE_ID,
            sets: [{ type: 'normal', weight_kg: 60, reps: 10 }],
          },
        ],
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as {
      dry_run: boolean;
      would_send: { method: string; path: string; body: unknown };
    };
    expect(parsed.dry_run).toBe(true);
    expect(parsed.would_send.method).toBe('POST');
    expect(parsed.would_send.path).toBe('/v1/workouts');
  });

  it('hevy_create_workout executes a POST when HEVY_MCP_ALLOW_WRITES=1', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key', HEVY_MCP_ALLOW_WRITES: '1' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'POST',
          pathRegex: '^/v1/workouts$',
          status: 201,
          body: { id: VALID_WORKOUT_UUID },
        },
      ],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_create_workout', {
      workout: {
        title: 'Live write',
        start_time: '2026-04-19T08:00:00Z',
        end_time: '2026-04-19T09:00:00Z',
        exercises: [
          {
            exercise_template_id: BUILT_IN_TEMPLATE_ID,
            sets: [{ type: 'normal', weight_kg: 60, reps: 10 }],
          },
        ],
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as { id: string };
    expect(parsed.id).toBe(VALID_WORKOUT_UUID);
  });

  it('validation errors reach the client as VALIDATION_ERROR before any fetch', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_create_exercise_template', {
      exercise: {
        title: 'x'.repeat(300),
        type: 'weight_reps',
        primary_muscle_group: 'chest',
      },
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text) as { error_code: string };
    expect(payload.error_code).toBe('VALIDATION_ERROR');
  });

  it('unknown tool name maps to UNKNOWN_TOOL', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_not_a_tool', {});
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text) as { error_code: string };
    expect(payload.error_code).toBe('UNKNOWN_TOOL');
  });

  it('hevy_list_exercise_templates serves the 2nd identical call from cache (single fixture consumed)', async () => {
    // Only one fixture; if cache misses the 2nd call, nock NetConnect will
    // surface as UPSTREAM_ERROR. A passing 2nd call proves the cache hit.
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?(?=.*\\bpage=1\\b)(?=.*\\bpageSize=10\\b)',
          status: 200,
          body: { page: 1, page_count: 1, exercise_templates: [{ id: 'ABCDEF12' }] },
        },
      ],
    });
    await initializeClient(client);
    const first = await callTool(client, 'hevy_list_exercise_templates', {});
    expect(first.isError).toBeFalsy();
    const second = await callTool(client, 'hevy_list_exercise_templates', {});
    expect(second.isError).toBeFalsy();
    const parsed = JSON.parse(second.content[0].text) as {
      exercise_templates: Array<{ id: string }>;
    };
    expect(parsed.exercise_templates[0].id).toBe('ABCDEF12');
  });

  it('HEVY_MCP_DISABLE_CACHE=1 forces every list call to hit the upstream', async () => {
    // Only one fixture: with cache disabled, the 2nd call must fall through
    // to nock and error (NetConnect disabled with no remaining interceptors).
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key', HEVY_MCP_DISABLE_CACHE: '1' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?(?=.*\\bpage=1\\b)(?=.*\\bpageSize=10\\b)',
          status: 200,
          body: { page: 1, page_count: 1, exercise_templates: [] },
        },
      ],
    });
    await initializeClient(client);
    const first = await callTool(client, 'hevy_list_exercise_templates', {});
    expect(first.isError).toBeFalsy();
    const second = await callTool(client, 'hevy_list_exercise_templates', {});
    expect(second.isError).toBe(true);
    const payload = JSON.parse(second.content[0].text) as { error_code: string };
    expect(payload.error_code).toBe('UPSTREAM_ERROR');
  });

  it('hevy_create_exercise_template invalidates the list cache (refetch required after write)', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key', HEVY_MCP_ALLOW_WRITES: '1' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?(?=.*\\bpage=1\\b)(?=.*\\bpageSize=10\\b)',
          status: 200,
          body: { page: 1, page_count: 1, exercise_templates: [] },
        },
        {
          method: 'POST',
          pathRegex: '^/v1/exercise_templates$',
          status: 201,
          body: { id: 'new-id' },
        },
      ],
    });
    await initializeClient(client);
    const first = await callTool(client, 'hevy_list_exercise_templates', {});
    expect(first.isError).toBeFalsy();
    const created = await callTool(client, 'hevy_create_exercise_template', {
      exercise: { title: 'My pull', type: 'weight_reps', primary_muscle_group: 'lats' },
    });
    expect(created.isError).toBeFalsy();
    // Second list call — cache was invalidated by the create, so this MUST
    // hit nock again. No GET interceptor remains, so it errors → proves
    // invalidation fired.
    const afterWrite = await callTool(client, 'hevy_list_exercise_templates', {});
    expect(afterWrite.isError).toBe(true);
    const payload = JSON.parse(afterWrite.content[0].text) as { error_code: string };
    expect(payload.error_code).toBe('UPSTREAM_ERROR');
  });

  it('hevy_search_exercise_templates paginates the full catalog on first call and filters by title', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?page=1&pageSize=100$',
          status: 200,
          body: {
            page: 1,
            page_count: 2,
            exercise_templates: [
              { id: 'AAAAAAAA', title: 'Bench Press', primary_muscle_group: 'chest' },
              { id: 'BBBBBBBB', title: 'Squat', primary_muscle_group: 'quadriceps' },
            ],
          },
        },
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?page=2&pageSize=100$',
          status: 200,
          body: {
            page: 2,
            page_count: 2,
            exercise_templates: [
              { id: 'CCCCCCCC', title: 'Incline Bench Press', primary_muscle_group: 'chest' },
              { id: 'DDDDDDDD', title: 'Deadlift', primary_muscle_group: 'hamstrings' },
            ],
          },
        },
      ],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_search_exercise_templates', { query: 'bench' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as {
      match_count: number;
      exercise_templates: Array<{ id: string; title: string }>;
    };
    expect(parsed.match_count).toBe(2);
    expect(parsed.exercise_templates.map((t) => t.id).sort()).toEqual(['AAAAAAAA', 'CCCCCCCC']);
  });

  it('hevy_search_exercise_templates applies the primaryMuscleGroup filter on top of the title match', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?page=1&pageSize=100$',
          status: 200,
          body: {
            page: 1,
            page_count: 1,
            exercise_templates: [
              { id: '11111111', title: 'Shoulder Press', primary_muscle_group: 'shoulders' },
              { id: '22222222', title: 'Leg Press', primary_muscle_group: 'quadriceps' },
            ],
          },
        },
      ],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_search_exercise_templates', {
      query: 'press',
      primaryMuscleGroup: 'shoulders',
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as {
      exercise_templates: Array<{ id: string }>;
    };
    expect(parsed.exercise_templates).toHaveLength(1);
    expect(parsed.exercise_templates[0].id).toBe('11111111');
  });

  it('hevy_search_exercise_templates reuses the full-catalog cache on subsequent searches (single paginate consumed)', async () => {
    // Only ONE page-1 fixture; the second search with a different query must
    // be served from cache. If the handler re-paginates, NetConnect kicks in
    // and the assertion fails.
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?page=1&pageSize=100$',
          status: 200,
          body: {
            page: 1,
            page_count: 1,
            exercise_templates: [
              { id: '11111111', title: 'Bench Press', primary_muscle_group: 'chest' },
              { id: '22222222', title: 'Pull Up', primary_muscle_group: 'lats' },
            ],
          },
        },
      ],
    });
    await initializeClient(client);
    const first = await callTool(client, 'hevy_search_exercise_templates', { query: 'bench' });
    expect(first.isError).toBeFalsy();
    const second = await callTool(client, 'hevy_search_exercise_templates', { query: 'pull' });
    expect(second.isError).toBeFalsy();
    const parsed = JSON.parse(second.content[0].text) as {
      exercise_templates: Array<{ id: string }>;
    };
    expect(parsed.exercise_templates).toHaveLength(1);
    expect(parsed.exercise_templates[0].id).toBe('22222222');
  });

  it('hevy_search_exercise_templates populates the per-id cache so hevy_get_exercise_template hits it', async () => {
    // Fixtures: ONE page-1 for the search. No individual get-by-id fixture —
    // if get_exercise_template doesn't hit the cache populated by search, it
    // falls through to NetConnect and errors.
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?page=1&pageSize=100$',
          status: 200,
          body: {
            page: 1,
            page_count: 1,
            exercise_templates: [{ id: 'ABCDEF12', title: 'Test', primary_muscle_group: 'chest' }],
          },
        },
      ],
    });
    await initializeClient(client);
    const search = await callTool(client, 'hevy_search_exercise_templates', { query: 'test' });
    expect(search.isError).toBeFalsy();
    const getOne = await callTool(client, 'hevy_get_exercise_template', {
      exerciseTemplateId: 'ABCDEF12',
    });
    expect(getOne.isError).toBeFalsy();
    const parsed = JSON.parse(getOne.content[0].text) as { id: string; title: string };
    expect(parsed.id).toBe('ABCDEF12');
    expect(parsed.title).toBe('Test');
  });

  it('hevy_search_exercise_templates with refresh:true re-paginates the catalog', async () => {
    // First search primes the cache. Second search with refresh:true expects
    // to re-fetch — only ONE page-1 fixture exists total, so the refresh
    // call must error (NetConnect) to prove the cache was bypassed.
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?page=1&pageSize=100$',
          status: 200,
          body: {
            page: 1,
            page_count: 1,
            exercise_templates: [{ id: '11111111', title: 'A', primary_muscle_group: 'chest' }],
          },
        },
      ],
    });
    await initializeClient(client);
    const primed = await callTool(client, 'hevy_search_exercise_templates', { query: 'a' });
    expect(primed.isError).toBeFalsy();
    const refreshed = await callTool(client, 'hevy_search_exercise_templates', {
      query: 'a',
      refresh: true,
    });
    expect(refreshed.isError).toBe(true);
    const payload = JSON.parse(refreshed.content[0].text) as { error_code: string };
    expect(payload.error_code).toBe('UPSTREAM_ERROR');
  });
});
