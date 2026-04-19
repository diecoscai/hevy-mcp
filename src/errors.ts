export type ErrorCode = 'VALIDATION_ERROR' | 'UPSTREAM_ERROR' | 'DRY_RUN' | 'UNKNOWN_TOOL';

export class ValidationError extends Error {
  readonly code: ErrorCode = 'VALIDATION_ERROR';
  readonly details?: string[];
  constructor(message: string, details?: string[]) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class HevyApiError extends Error {
  readonly code: ErrorCode = 'UPSTREAM_ERROR';
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Hevy API error ${status}: ${body || '(empty body)'}`);
    this.name = 'HevyApiError';
    this.status = status;
    this.body = body;
  }
}

export class UnknownToolError extends Error {
  readonly code: ErrorCode = 'UNKNOWN_TOOL';
  constructor(toolName: string) {
    super(`unknown tool: ${toolName}`);
    this.name = 'UnknownToolError';
  }
}

export interface SepErrorPayload {
  error_code: ErrorCode;
  message: string;
  details?: unknown;
  hint?: string;
}

export interface SepErrorResult {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
}

function hintFor(code: ErrorCode, err: unknown): string | undefined {
  if (code === 'VALIDATION_ERROR') {
    return 'fix the listed fields and retry; unknown keys are rejected';
  }
  if (code === 'UPSTREAM_ERROR') {
    const status = (err as HevyApiError).status;
    if (status === 401) return 'set HEVY_API_KEY to a valid Hevy Pro key';
    if (status === 404) return 'resource not found; verify the id or date';
    if (status === 409) return 'a record already exists; use the update tool instead';
    if (status === 400) return 'request rejected by Hevy; review the body and enum values';
  }
  return undefined;
}

export function toToolExecutionError(err: unknown): SepErrorResult {
  let payload: SepErrorPayload;

  if (err instanceof ValidationError) {
    payload = {
      error_code: err.code,
      message: err.message,
      details: err.details,
      hint: hintFor(err.code, err),
    };
  } else if (err instanceof HevyApiError) {
    payload = {
      error_code: err.code,
      message: err.message,
      details: { status: err.status, body: err.body },
      hint: hintFor(err.code, err),
    };
  } else if (err instanceof UnknownToolError) {
    payload = {
      error_code: err.code,
      message: err.message,
      hint: 'call tools/list to see supported tool names',
    };
  } else {
    const message = err instanceof Error ? err.message : String(err);
    payload = {
      error_code: 'UPSTREAM_ERROR',
      message,
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

export function dryRunResult(
  method: string,
  path: string,
  body?: unknown
): {
  content: Array<{ type: 'text'; text: string }>;
} {
  const payload = {
    dry_run: true,
    would_send: { method, path, ...(body !== undefined ? { body } : {}) },
    hint: 'set HEVY_MCP_ALLOW_WRITES=1 to execute',
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}
