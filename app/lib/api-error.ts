export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 502 | 503,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
