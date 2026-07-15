import type { ApiErrorResponse } from "@lunch/shared";

export interface AdminRequestContext {
  apiBaseUrl: string;
  token?: string | undefined;
  signal?: AbortSignal | undefined;
}

export class AdminApiError extends Error {
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly kind: "http" | "network" | "invalid-response";

  constructor(input: {
    kind: "http" | "network" | "invalid-response";
    status?: number | undefined;
    code?: string | undefined;
    message?: string | undefined;
  }) {
    super(input.message ?? input.code ?? input.kind);
    this.name = "AdminApiError";
    this.kind = input.kind;
    this.status = input.status;
    this.code = input.code;
  }
}

function safeMessage(message: string | undefined, token: string | undefined): string | undefined {
  if (!message || !token) return message;
  return message.split(token).join("[redacted]");
}

function requestHeaders(
  input: HeadersInit | undefined,
  token: string | undefined,
  hasBody: boolean
): Record<string, string> {
  const headers: Record<string, string> = {};
  new Headers(input).forEach((value, key) => { headers[key] = value; });
  if (hasBody && !("content-type" in headers)) {
    headers["content-type"] = "application/json";
  }
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

export async function requestJson<T>(
  path: string,
  context: AdminRequestContext,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${context.apiBaseUrl}${path}`, {
      ...init,
      ...(context.signal ? { signal: context.signal } : {}),
      headers: requestHeaders(
        init.headers,
        context.token,
        init.body !== undefined && init.body !== null
      )
    });
  } catch (error) {
    throw new AdminApiError({
      kind: "network",
      message: safeMessage(
        error instanceof Error ? error.message : "network_error",
        context.token
      )
    });
  }

  if (!response.ok) {
    let body: Partial<ApiErrorResponse> = {};
    try {
      body = await response.json() as Partial<ApiErrorResponse>;
    } catch {
      body = {};
    }
    throw new AdminApiError({
      kind: "http",
      status: response.status,
      code: body.error,
      message: safeMessage(body.message ?? `HTTP ${response.status}`, context.token)
    });
  }

  try {
    return await response.json() as T;
  } catch {
    throw new AdminApiError({
      kind: "invalid-response",
      status: response.status,
      code: "invalid_json_response"
    });
  }
}
