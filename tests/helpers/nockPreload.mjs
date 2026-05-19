// Test-only preload: installs nock interceptors for api.hevyapp.com before
// the MCP server boots. Used via NODE_OPTIONS=--import=<this-file> so the
// fetch() the MCP handler makes in the subprocess is captured here.
//
// The interceptor list is read from the HEVY_TEST_FIXTURES env var
// (JSON array). Each fixture:
//   { method, pathRegex, status, body, bodyEquals?, bodyContains? }
// If bodyEquals is provided, the fixture only matches when the request
// body deep-equals that object. If bodyContains is provided, the fixture
// matches when the request body contains every key/value pair in it.
// If neither is provided, any body matches. A failed match falls through
// to NetConnect-disabled nock, which surfaces as UPSTREAM_ERROR in tests.
import nock from 'nock';

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.hasOwn(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function containsAll(actual, expected) {
  if (actual === null || typeof actual !== 'object') return false;
  for (const [k, v] of Object.entries(expected)) {
    if (!(k in actual)) return false;
    if (v !== null && typeof v === 'object') {
      if (!containsAll(actual[k], v)) return false;
    } else if (actual[k] !== v) return false;
  }
  return true;
}

function bodyMatcher(fx) {
  if (fx.bodyEquals !== undefined) return (body) => deepEqual(body, fx.bodyEquals);
  if (fx.bodyContains !== undefined) return (body) => containsAll(body, fx.bodyContains);
  return undefined;
}

const raw = process.env.HEVY_TEST_FIXTURES;
if (raw) {
  const fixtures = JSON.parse(raw);
  nock.disableNetConnect();
  for (const fx of fixtures) {
    const scope = nock('https://api.hevyapp.com');
    const re = new RegExp(fx.pathRegex);
    const match = bodyMatcher(fx);
    if (fx.method === 'GET') scope.get(re).reply(fx.status, fx.body);
    else if (fx.method === 'POST') {
      if (match) scope.post(re, match).reply(fx.status, fx.body);
      else scope.post(re).reply(fx.status, fx.body);
    } else if (fx.method === 'PUT') {
      if (match) scope.put(re, match).reply(fx.status, fx.body);
      else scope.put(re).reply(fx.status, fx.body);
    }
  }
}
