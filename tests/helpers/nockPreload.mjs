// Test-only preload: installs nock interceptors for api.hevyapp.com before
// the MCP server boots. Used via NODE_OPTIONS=--import=<this-file> so the
// fetch() the MCP handler makes in the subprocess is captured here.
//
// The interceptor list is read from the HEVY_TEST_FIXTURES env var
// (JSON array). Each fixture: { method, pathRegex, status, body, headers? }.
import nock from 'nock';

const raw = process.env.HEVY_TEST_FIXTURES;
if (raw) {
  const fixtures = JSON.parse(raw);
  nock.disableNetConnect();
  for (const fx of fixtures) {
    const scope = nock('https://api.hevyapp.com');
    const re = new RegExp(fx.pathRegex);
    if (fx.method === 'GET') scope.get(re).reply(fx.status, fx.body);
    else if (fx.method === 'POST') scope.post(re).reply(fx.status, fx.body);
    else if (fx.method === 'PUT') scope.put(re).reply(fx.status, fx.body);
  }
}
