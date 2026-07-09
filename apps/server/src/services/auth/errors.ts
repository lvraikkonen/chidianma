export type AuthErrorCode = "unauthorized" | "forbidden" | "bad_request";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    public readonly error: string,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}
