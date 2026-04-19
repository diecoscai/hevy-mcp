#!/usr/bin/env bash
# Smoke test for hevy-mcp.
# Runs install + build + test + lint, then probes the compiled server via
# stdio, asserts the advertised tool count, validates every inputSchema as
# JSON Schema Draft 2020-12, and greps user-facing files for non-English
# markers.
#
# Exits non-zero on the first failure. Safe to run in CI.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo '== install =='
npm ci

echo '== build =='
npm run build

echo '== test =='
npm test

echo '== lint =='
npm run lint

echo '== subprocess probe =='
node --input-type=module -e "
  import { spawn } from 'node:child_process';
  import Ajv2020 from 'ajv/dist/2020.js';
  import addFormats from 'ajv-formats';

  const EXPECTED_TOOLS = 22;
  const ajv = new Ajv2020.default({ strict: false });
  addFormats.default(ajv);

  const proc = spawn('node', ['dist/index.js'], {
    env: { ...process.env, HEVY_API_KEY: 'smoke-test' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let buf = '';
  const timeout = setTimeout(() => {
    console.error('smoke probe timed out');
    proc.kill('SIGKILL');
    process.exit(1);
  }, 15000);

  proc.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== 2) continue;
      clearTimeout(timeout);
      const tools = msg.result.tools;
      if (!Array.isArray(tools) || tools.length !== EXPECTED_TOOLS) {
        console.error('expected', EXPECTED_TOOLS, 'tools, got', tools?.length);
        proc.kill('SIGKILL');
        process.exit(1);
      }
      let fail = 0;
      for (const t of tools) {
        try { ajv.compile(t.inputSchema); }
        catch (e) { fail++; console.error('bad schema for', t.name, '-', e.message); }
      }
      if (fail) { proc.kill('SIGKILL'); process.exit(1); }
      console.log('probe ok — tools:', tools.length, 'schemas: all valid');
      proc.kill('SIGTERM');
      process.exit(0);
    }
  });

  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } }) + '\n');
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
"

echo '== language gate =='
# Scan user-facing files for Spanish markers: accented vowels/punctuation
# and common Spanish words. Fails on the first hit. Limited to the
# published surface (src, README, LICENSE, config) — PROGRESS.md and this
# script itself are excluded because they describe the pattern.
targets=(
  "README.md"
  "LICENSE"
  "CHANGELOG.md"
  "biome.json"
  "package.json"
  "tsconfig.json"
  "src"
)

existing=()
for t in "${targets[@]}"; do
  if [ -e "$t" ]; then existing+=("$t"); fi
done

pattern='[áéíóúñÁÉÍÓÚÑ¿¡]|\b(hola|gracias|porque|también|siempre|nunca|ahora|entonces|mientras|aunque|siguiente|usuario|contraseña|listo|prueba|datos|configuración|servidor|archivo|carpeta|lectura|escritura|tarea|entrenamiento|rutina|ejercicio|repeticiones|peso|kilogramos|libras|medidas)\b'
if grep -REn --binary-files=without-match -I -E "$pattern" "${existing[@]}"; then
  echo 'language gate: Spanish markers found' >&2
  exit 1
fi
echo 'language gate: clean'

echo '== smoke ok =='
