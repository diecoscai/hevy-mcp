// Downloads Hevy's OpenAPI spec and writes it to openapi/hevy.json.
// The spec is embedded in the Swagger UI bundle as `"swaggerDoc": {...}`;
// this extracts that object by brace-matching. Run: npm run fetch-spec
import { writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'https://api.hevyapp.com/docs/swagger-ui-init.js';
const OUT = 'openapi/hevy.json';

const res = await fetch(SRC, { signal: AbortSignal.timeout(30_000) });
if (!res.ok) {
  console.error(`fetch-spec: HTTP ${res.status} from ${SRC}`);
  process.exit(1);
}
const js = await res.text();

const marker = '"swaggerDoc":';
const start = js.indexOf(marker);
if (start < 0) {
  console.error('fetch-spec: could not find "swaggerDoc" in the bundle');
  process.exit(1);
}
let i = js.indexOf('{', start);
let depth = 0;
let end = -1;
let inStr = false;
let esc = false;
for (let p = i; p < js.length; p += 1) {
  const c = js[p];
  if (inStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === '"') inStr = false;
    continue;
  }
  if (c === '"') inStr = true;
  else if (c === '{') depth += 1;
  else if (c === '}') {
    depth -= 1;
    if (depth === 0) {
      end = p + 1;
      break;
    }
  }
}
if (end < 0) {
  console.error('fetch-spec: could not brace-match the swaggerDoc object');
  process.exit(1);
}
const spec = JSON.parse(js.slice(i, end));
mkdirSync('openapi', { recursive: true });
writeFileSync(OUT, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`fetch-spec: wrote ${OUT} (openapi ${spec.openapi}, ${Object.keys(spec.paths).length} paths)`);
