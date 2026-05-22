import { defineConfig } from '@kubb/core';
import { pluginOas } from '@kubb/plugin-oas';
import { pluginZod } from '@kubb/plugin-zod';

export default defineConfig({
  root: '.',
  input: { path: './openapi/hevy.json' },
  output: { path: './src/generated', clean: true, extension: { '.ts': '.js' } },
  plugins: [
    pluginOas({ output: { path: './oas' } }),
    pluginZod({ output: { path: './zod' } }),
  ],
});
