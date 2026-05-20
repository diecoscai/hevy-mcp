import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { writeUserConfig } from './userConfig.js';

const BASE_URL = 'https://api.hevyapp.com';

export interface KeyCheck {
  ok: boolean;
  userName?: string;
  status?: number;
  error?: string;
}

// Probe GET /v1/user/info to confirm the key works before saving it.
export async function validateApiKey(key: string): Promise<KeyCheck> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/user/info`, {
      headers: { 'api-key': key },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (res.ok) {
    let userName: string | undefined;
    try {
      const body = (await res.json()) as { data?: { name?: string }; name?: string };
      userName = body?.data?.name ?? body?.name;
    } catch {
      // Key is valid even if the body fails to parse — leave userName unset.
    }
    return { ok: true, userName };
  }
  return { ok: false, status: res.status };
}

const CLIENT_SNIPPET = `  {
    "mcpServers": {
      "hevy": {
        "command": "npx",
        "args": ["-y", "@diecoscai/hevy-mcp"]
      }
    }
  }`;

type Rl = ReturnType<typeof createInterface>;

// Wraps rl.question so a closed stream (EOF on piped input) yields null
// instead of throwing ERR_USE_AFTER_CLOSE.
async function ask(rl: Rl, prompt: string): Promise<string | null> {
  try {
    return await rl.question(prompt);
  } catch {
    return null;
  }
}

// Interactive `npx @diecoscai/hevy-mcp setup` flow: prompt for the key,
// validate it live, ask about writes, and persist the config file.
export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write('hevy-mcp setup\n\n');
    stdout.write('Get your Hevy Pro API key at https://hevy.com/settings?developer\n\n');

    let key = '';
    let check: KeyCheck | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const input = await ask(rl, 'Hevy API key: ');
      if (input === null) {
        stdout.write('\nSetup aborted: no input received.\n');
        process.exitCode = 1;
        return;
      }
      key = input.trim();
      if (!key) {
        stdout.write('  Empty input — try again.\n');
        continue;
      }
      stdout.write('  Validating against the Hevy API...\n');
      const result = await validateApiKey(key);
      if (result.ok) {
        check = result;
        break;
      }
      if (result.status === 401) {
        stdout.write('  Rejected (401): the key is invalid or the account is not Hevy Pro.\n');
      } else if (result.status) {
        stdout.write(`  Hevy API returned HTTP ${result.status}. Try again.\n`);
      } else {
        stdout.write(`  Could not reach the Hevy API: ${result.error}. Try again.\n`);
      }
    }

    if (!check) {
      stdout.write('\nSetup aborted: no valid API key after 3 attempts.\n');
      process.exitCode = 1;
      return;
    }
    stdout.write(`  Key OK${check.userName ? ` — signed in as ${check.userName}` : ''}.\n\n`);

    stdout.write('Write operations (create/update workouts, routines, measurements) are\n');
    stdout.write('OFF by default. The Hevy API has no undo for a bad write.\n');
    const answer = (await ask(rl, 'Enable write operations? [y/N]: '))?.trim().toLowerCase() ?? '';
    const allowWrites = answer === 'y' || answer === 'yes';

    const path = writeUserConfig({ apiKey: key, allowWrites });
    stdout.write(`\nSaved ${path} (permissions 0600).\n`);
    stdout.write(`Writes: ${allowWrites ? 'ENABLED' : 'disabled (dry-run preview only)'}.\n\n`);
    stdout.write('Add this to your MCP client config — no env block needed:\n\n');
    stdout.write(`${CLIENT_SNIPPET}\n\n`);
    stdout.write('The server reads the key (and the writes setting) from the config file.\n');
  } finally {
    rl.close();
  }
}
