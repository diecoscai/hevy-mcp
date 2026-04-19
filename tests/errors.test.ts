import { describe, expect, it } from 'vitest';
import {
  dryRunResult,
  HevyApiError,
  type SepErrorPayload,
  toToolExecutionError,
  UnknownToolError,
  ValidationError,
} from '../src/errors.js';

function parseResultPayload(result: {
  content: Array<{ type: 'text'; text: string }>;
}): Record<string, unknown> {
  expect(result.content.length).toBe(1);
  const entry = result.content[0];
  expect(entry.type).toBe('text');
  return JSON.parse(entry.text) as Record<string, unknown>;
}

describe('toToolExecutionError', () => {
  it('wraps ValidationError into SEP-1303 shape with VALIDATION_ERROR', () => {
    const err = new ValidationError('title: too long', ['title: too long']);
    const result = toToolExecutionError(err);
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    const payload = JSON.parse(result.content[0].text) as SepErrorPayload;
    expect(payload.error_code).toBe('VALIDATION_ERROR');
    expect(payload.message).toBe('title: too long');
    expect(payload.details).toEqual(['title: too long']);
    expect(typeof payload.hint).toBe('string');
  });

  it('wraps HevyApiError into SEP-1303 shape with UPSTREAM_ERROR', () => {
    const err = new HevyApiError(404, '{"error":"not found"}');
    const result = toToolExecutionError(err);
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text) as SepErrorPayload;
    expect(payload.error_code).toBe('UPSTREAM_ERROR');
    expect(payload.message).toContain('404');
    expect(payload.details).toEqual({ status: 404, body: '{"error":"not found"}' });
    expect(payload.hint).toMatch(/not found/i);
  });

  it('emits a 401 hint pointing at HEVY_API_KEY', () => {
    const payload = JSON.parse(
      toToolExecutionError(new HevyApiError(401, 'unauthorized')).content[0].text
    ) as SepErrorPayload;
    expect(payload.hint).toMatch(/HEVY_API_KEY/);
  });

  it('emits a 409 hint suggesting the update tool', () => {
    const payload = JSON.parse(
      toToolExecutionError(new HevyApiError(409, 'conflict')).content[0].text
    ) as SepErrorPayload;
    expect(payload.hint).toMatch(/update/i);
  });

  it('wraps UnknownToolError into SEP-1303 shape with UNKNOWN_TOOL', () => {
    const err = new UnknownToolError('hevy_fake');
    const result = toToolExecutionError(err);
    const payload = JSON.parse(result.content[0].text) as SepErrorPayload;
    expect(payload.error_code).toBe('UNKNOWN_TOOL');
    expect(payload.message).toContain('hevy_fake');
    expect(payload.hint).toMatch(/tools\/list/);
  });

  it('wraps a plain Error into UPSTREAM_ERROR fallback', () => {
    const result = toToolExecutionError(new Error('boom'));
    const payload = JSON.parse(result.content[0].text) as SepErrorPayload;
    expect(payload.error_code).toBe('UPSTREAM_ERROR');
    expect(payload.message).toBe('boom');
  });

  it('wraps a non-Error thrown value into UPSTREAM_ERROR fallback', () => {
    const result = toToolExecutionError('bare string');
    const payload = JSON.parse(result.content[0].text) as SepErrorPayload;
    expect(payload.error_code).toBe('UPSTREAM_ERROR');
    expect(payload.message).toBe('bare string');
  });
});

describe('dryRunResult', () => {
  it('returns a non-error envelope with dry_run=true and would_send', () => {
    const result = dryRunResult('POST', '/v1/workouts', { title: 'T' });
    expect((result as { isError?: boolean }).isError).toBeUndefined();
    const payload = parseResultPayload(result);
    expect(payload.dry_run).toBe(true);
    expect(payload.would_send).toEqual({
      method: 'POST',
      path: '/v1/workouts',
      body: { title: 'T' },
    });
    expect(typeof payload.hint).toBe('string');
    expect(payload.hint).toMatch(/HEVY_MCP_ALLOW_WRITES/);
  });

  it('omits body field when no body is passed', () => {
    const result = dryRunResult('POST', '/v1/workouts');
    const payload = parseResultPayload(result);
    expect(payload.would_send).toEqual({ method: 'POST', path: '/v1/workouts' });
  });
});

describe('error class identity', () => {
  it('ValidationError has code VALIDATION_ERROR', () => {
    expect(new ValidationError('x').code).toBe('VALIDATION_ERROR');
  });

  it('HevyApiError carries status and body', () => {
    const e = new HevyApiError(500, 'oops');
    expect(e.code).toBe('UPSTREAM_ERROR');
    expect(e.status).toBe(500);
    expect(e.body).toBe('oops');
  });

  it('UnknownToolError has code UNKNOWN_TOOL', () => {
    expect(new UnknownToolError('t').code).toBe('UNKNOWN_TOOL');
  });
});
