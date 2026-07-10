import type { ApiErrorResponse } from "@lunch/shared";

export type ExtensionApiErrorKind = "http" | "network" | "invalid-response";

export class ExtensionApiError extends Error {
  readonly kind: ExtensionApiErrorKind;
  readonly status?: number | undefined;
  readonly code?: string | undefined;

  constructor(input: {
    kind: ExtensionApiErrorKind;
    status?: number | undefined;
    code?: string | undefined;
    message?: string | undefined;
  }) {
    super(input.message ?? input.code ?? input.kind);
    this.name = "ExtensionApiError";
    this.kind = input.kind;
    this.status = input.status;
    this.code = input.code;
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    throw new ExtensionApiError({
      kind: "network",
      message: error instanceof Error ? error.message : "network_error"
    });
  }

  if (!response.ok) {
    let body: Partial<ApiErrorResponse> = {};
    try {
      body = await response.json() as Partial<ApiErrorResponse>;
    } catch {
      body = {};
    }
    throw new ExtensionApiError({
      kind: "http",
      status: response.status,
      code: body.error,
      message: body.message ?? `HTTP ${response.status}`
    });
  }

  try {
    return await response.json() as T;
  } catch {
    throw new ExtensionApiError({
      kind: "invalid-response",
      status: response.status,
      code: "invalid_json_response",
      message: "Server returned invalid JSON"
    });
  }
}

export function isServiceUnavailable(error: unknown): boolean {
  return error instanceof ExtensionApiError && (
    error.kind === "network"
    || (error.kind === "http" && error.status !== undefined && error.status >= 500)
  );
}
