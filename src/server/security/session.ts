import { timingSafeEqual } from "node:crypto";
import { AppError } from "../errors.js";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class SessionGuard {
  constructor(
    private readonly token: string,
    private publicOrigin: string,
  ) {}

  setPublicOrigin(origin: string): void {
    this.publicOrigin = origin;
  }

  assertHttpOrigin(origin: string | undefined, method: string): void {
    const safeMethod = method === "GET" || method === "HEAD" || method === "OPTIONS";
    if (
      (!safeMethod && origin !== this.publicOrigin) ||
      (origin !== undefined && origin !== this.publicOrigin)
    ) {
      throw new AppError("origin_forbidden", "Browser origin is not allowed", 403);
    }
  }

  assertWebSocketOrigin(origin: string | undefined): void {
    if (origin !== this.publicOrigin) {
      throw new AppError("origin_forbidden", "Browser origin is not allowed", 403);
    }
  }

  assertAuthorization(header: string | undefined): void {
    const prefix = "Bearer ";
    if (!header?.startsWith(prefix) || !safeEqual(header.slice(prefix.length), this.token)) {
      throw new AppError("unauthorized", "Valid local session token required", 401);
    }
  }

  verifyToken(token: string): boolean {
    return safeEqual(token, this.token);
  }
}
