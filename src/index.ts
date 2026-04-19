import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

const API_KEY = process.env.HEVY_API_KEY;
const BASE_URL = 'https://api.hevyapp.com';

if (!API_KEY) {
  console.error('HEVY_API_KEY environment variable is required');
  process.exit(1);
}

async function hevyFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'api-key': API_KEY!,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Hevy API error ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const TOOLS: Tool[] = [
  {
    name: 'hevy_get_user_info',
    description: 'Get current authenticated user info (name, id, profile URL)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'hevy_list_workouts',
    description: 'Get a paginated list of workouts',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default: 1)' },
        pageSize: { type: 'number', description: 'Items per page (default: 10, max: 100)' },
      },
    },
  },
  {
    name: 'hevy_get_workout',
    description: "Get a single workout's complete details",
    inputSchema: {
      type: 'object',
      required: ['workoutId'],
      properties: {
        workoutId: { type: 'string', description: 'UUID of the workout' },
      },
    },
  },
  {
    name: 'hevy_get_workout_count',
    description: 'Get the total number of workouts on the account',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'hevy_get_workout_events',
    description:
      'Get paginated workout events (updates/deletes) since a given date. Use for incremental sync.',
    inputSchema: {
      type: 'object',
      properties: {
        since: {
          type: 'string',
          description: 'ISO 8601 date string — only events after this date are returned',
        },
        page: { type: 'number', description: 'Page number (default: 1)' },
        pageSize: { type: 'number', description: 'Items per page (default: 10)' },
      },
    },
  },
  {
    name: 'hevy_create_workout',
    description: 'Create a new workout with exercises and sets',
    inputSchema: {
      type: 'object',
      required: ['workout'],
      properties: {
        workout: {
          type: 'object',
          description: 'Workout object',
          required: ['title', 'start_time', 'end_time', 'exercises'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            start_time: { type: 'string', description: 'ISO 8601 datetime' },
            end_time: { type: 'string', description: 'ISO 8601 datetime' },
            routine_id: { type: 'string', description: 'Optional linked routine UUID' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                required: ['exercise_template_id', 'sets'],
                properties: {
                  exercise_template_id: { type: 'string' },
                  superset_id: { type: 'number', description: 'Optional superset group' },
                  notes: { type: 'string' },
                  sets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['type'],
                      properties: {
                        type: {
                          type: 'string',
                          enum: ['warmup', 'normal', 'failure', 'dropset'],
                        },
                        weight_kg: { type: 'number' },
                        reps: { type: 'number' },
                        distance_meters: { type: 'number' },
                        duration_seconds: { type: 'number' },
                        rpe: { type: 'number', description: 'Rate of perceived exertion (0-10)' },
                        custom_metric: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'hevy_update_workout',
    description: 'Update an existing workout',
    inputSchema: {
      type: 'object',
      required: ['workoutId', 'workout'],
      properties: {
        workoutId: { type: 'string', description: 'UUID of the workout to update' },
        workout: {
          type: 'object',
          description: 'Updated workout fields (same structure as create)',
        },
      },
    },
  },
  {
    name: 'hevy_list_routines',
    description: 'Get a paginated list of routines',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number' },
        pageSize: { type: 'number' },
      },
    },
  },
  {
    name: 'hevy_get_routine',
    description: 'Get a single routine by ID',
    inputSchema: {
      type: 'object',
      required: ['routineId'],
      properties: {
        routineId: { type: 'string' },
      },
    },
  },
  {
    name: 'hevy_create_routine',
    description: 'Create a new workout routine',
    inputSchema: {
      type: 'object',
      required: ['routine'],
      properties: {
        routine: {
          type: 'object',
          required: ['title', 'exercises'],
          properties: {
            title: { type: 'string' },
            folder_id: { type: 'number', description: 'Optional routine folder ID' },
            notes: { type: 'string' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                required: ['exercise_template_id', 'sets'],
                properties: {
                  exercise_template_id: { type: 'string' },
                  superset_id: { type: 'number' },
                  notes: { type: 'string' },
                  sets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['warmup', 'normal', 'failure', 'dropset'] },
                        weight_kg: { type: 'number' },
                        reps: { type: 'number' },
                        distance_meters: { type: 'number' },
                        duration_seconds: { type: 'number' },
                        rpe: { type: 'number' },
                        custom_metric: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'hevy_update_routine',
    description: 'Update an existing routine',
    inputSchema: {
      type: 'object',
      required: ['routineId', 'routine'],
      properties: {
        routineId: { type: 'string' },
        routine: { type: 'object', description: 'Updated routine fields' },
      },
    },
  },
  {
    name: 'hevy_list_routine_folders',
    description: 'Get a paginated list of routine folders',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number' },
        pageSize: { type: 'number' },
      },
    },
  },
  {
    name: 'hevy_get_routine_folder',
    description: 'Get a single routine folder by ID',
    inputSchema: {
      type: 'object',
      required: ['folderId'],
      properties: {
        folderId: { type: 'number' },
      },
    },
  },
  {
    name: 'hevy_create_routine_folder',
    description: 'Create a new routine folder (inserted at index 0)',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
      },
    },
  },
  {
    name: 'hevy_list_exercise_templates',
    description: 'Get a paginated list of exercise templates (built-in + custom)',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number' },
        pageSize: { type: 'number' },
      },
    },
  },
  {
    name: 'hevy_get_exercise_template',
    description: 'Get a single exercise template by ID',
    inputSchema: {
      type: 'object',
      required: ['exerciseTemplateId'],
      properties: {
        exerciseTemplateId: { type: 'string' },
      },
    },
  },
  {
    name: 'hevy_create_exercise_template',
    description: 'Create a custom exercise template',
    inputSchema: {
      type: 'object',
      required: ['exercise'],
      properties: {
        exercise: {
          type: 'object',
          required: ['title', 'type', 'primary_muscle_group'],
          properties: {
            title: { type: 'string' },
            type: {
              type: 'string',
              enum: ['weight_reps', 'reps_only', 'duration', 'distance_duration', 'weight_duration'],
            },
            primary_muscle_group: { type: 'string' },
            secondary_muscle_groups: { type: 'array', items: { type: 'string' } },
            equipment_category: { type: 'string' },
            is_custom: { type: 'boolean' },
          },
        },
      },
    },
  },
  {
    name: 'hevy_get_exercise_history',
    description: 'Get workout history for a specific exercise template',
    inputSchema: {
      type: 'object',
      required: ['exerciseTemplateId'],
      properties: {
        exerciseTemplateId: { type: 'string' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
      },
    },
  },
];

const server = new Server(
  { name: 'hevy-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    let result: unknown;

    switch (name) {
      case 'hevy_get_user_info':
        result = await hevyFetch('/v1/user/info');
        break;

      case 'hevy_list_workouts': {
        const { page = 1, pageSize = 10 } = args as { page?: number; pageSize?: number };
        result = await hevyFetch(`/v1/workouts?page=${page}&pageSize=${pageSize}`);
        break;
      }

      case 'hevy_get_workout': {
        const { workoutId } = args as { workoutId: string };
        result = await hevyFetch(`/v1/workouts/${workoutId}`);
        break;
      }

      case 'hevy_get_workout_count':
        result = await hevyFetch('/v1/workouts/count');
        break;

      case 'hevy_get_workout_events': {
        const { since, page = 1, pageSize = 10 } = args as {
          since?: string;
          page?: number;
          pageSize?: number;
        };
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (since) params.set('since', since);
        result = await hevyFetch(`/v1/workouts/events?${params}`);
        break;
      }

      case 'hevy_create_workout': {
        const { workout } = args as { workout: unknown };
        result = await hevyFetch('/v1/workouts', {
          method: 'POST',
          body: JSON.stringify({ workout }),
        });
        break;
      }

      case 'hevy_update_workout': {
        const { workoutId, workout } = args as { workoutId: string; workout: unknown };
        result = await hevyFetch(`/v1/workouts/${workoutId}`, {
          method: 'PUT',
          body: JSON.stringify({ workout }),
        });
        break;
      }

      case 'hevy_list_routines': {
        const { page = 1, pageSize = 10 } = args as { page?: number; pageSize?: number };
        result = await hevyFetch(`/v1/routines?page=${page}&pageSize=${pageSize}`);
        break;
      }

      case 'hevy_get_routine': {
        const { routineId } = args as { routineId: string };
        result = await hevyFetch(`/v1/routines/${routineId}`);
        break;
      }

      case 'hevy_create_routine': {
        const { routine } = args as { routine: unknown };
        result = await hevyFetch('/v1/routines', {
          method: 'POST',
          body: JSON.stringify({ routine }),
        });
        break;
      }

      case 'hevy_update_routine': {
        const { routineId, routine } = args as { routineId: string; routine: unknown };
        result = await hevyFetch(`/v1/routines/${routineId}`, {
          method: 'PUT',
          body: JSON.stringify({ routine }),
        });
        break;
      }

      case 'hevy_list_routine_folders': {
        const { page = 1, pageSize = 10 } = args as { page?: number; pageSize?: number };
        result = await hevyFetch(`/v1/routine_folders?page=${page}&pageSize=${pageSize}`);
        break;
      }

      case 'hevy_get_routine_folder': {
        const { folderId } = args as { folderId: number };
        result = await hevyFetch(`/v1/routine_folders/${folderId}`);
        break;
      }

      case 'hevy_create_routine_folder': {
        const { title } = args as { title: string };
        result = await hevyFetch('/v1/routine_folders', {
          method: 'POST',
          body: JSON.stringify({ routine_folder: { title } }),
        });
        break;
      }

      case 'hevy_list_exercise_templates': {
        const { page = 1, pageSize = 10 } = args as { page?: number; pageSize?: number };
        result = await hevyFetch(`/v1/exercise_templates?page=${page}&pageSize=${pageSize}`);
        break;
      }

      case 'hevy_get_exercise_template': {
        const { exerciseTemplateId } = args as { exerciseTemplateId: string };
        result = await hevyFetch(`/v1/exercise_templates/${exerciseTemplateId}`);
        break;
      }

      case 'hevy_create_exercise_template': {
        const { exercise } = args as { exercise: unknown };
        result = await hevyFetch('/v1/exercise_templates', {
          method: 'POST',
          body: JSON.stringify({ exercise_template: exercise }),
        });
        break;
      }

      case 'hevy_get_exercise_history': {
        const { exerciseTemplateId, page = 1, pageSize = 10 } = args as {
          exerciseTemplateId: string;
          page?: number;
          pageSize?: number;
        };
        result = await hevyFetch(
          `/v1/exercise_history/${exerciseTemplateId}?page=${page}&pageSize=${pageSize}`
        );
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hevy MCP server running');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
