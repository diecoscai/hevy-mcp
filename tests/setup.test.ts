import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { validateApiKey } from '../src/setup.js';

const BASE = 'https://api.hevyapp.com';

describe('validateApiKey', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('returns ok with the user name on HTTP 200 ({ data: { name } } envelope)', async () => {
    nock(BASE)
      .get('/v1/user/info')
      .reply(200, { data: { name: 'Diego' } });
    const r = await validateApiKey('k');
    expect(r.ok).toBe(true);
    expect(r.userName).toBe('Diego');
  });

  it('returns ok and reads a top-level name when there is no data envelope', async () => {
    nock(BASE).get('/v1/user/info').reply(200, { name: 'Flat' });
    const r = await validateApiKey('k');
    expect(r.ok).toBe(true);
    expect(r.userName).toBe('Flat');
  });

  it('returns not-ok with status 401 for a bad or non-Pro key', async () => {
    nock(BASE).get('/v1/user/info').reply(401, 'Unauthorized');
    const r = await validateApiKey('k');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it('returns not-ok with the upstream status for other failures', async () => {
    nock(BASE).get('/v1/user/info').reply(500, 'oops');
    const r = await validateApiKey('k');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
  });

  it('still returns ok when a 200 body cannot be parsed as JSON', async () => {
    nock(BASE).get('/v1/user/info').reply(200, 'not json');
    const r = await validateApiKey('k');
    expect(r.ok).toBe(true);
    expect(r.userName).toBeUndefined();
  });

  it('sends the key in the api-key header', async () => {
    const scope = nock(BASE, { reqheaders: { 'api-key': 'my-secret' } })
      .get('/v1/user/info')
      .reply(200, { data: { name: 'X' } });
    const r = await validateApiKey('my-secret');
    expect(r.ok).toBe(true);
    expect(scope.isDone()).toBe(true);
  });
});
