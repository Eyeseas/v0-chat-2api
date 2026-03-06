import type { FastifyInstance } from "fastify";

export class ProxyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "ProxyError";
  }
}

export class ValidationError extends ProxyError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends ProxyError {
  constructor(message: string = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends ProxyError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class UpstreamError extends ProxyError {
  constructor(
    message: string,
    public readonly upstreamStatus?: number,
    public readonly upstreamBody?: string
  ) {
    super(message, "UPSTREAM_ERROR", 502);
    this.name = "UpstreamError";
  }
}

export function setupErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, request, reply) => {
    // Log full error internally
    request.log.error(error);

    if (error instanceof ProxyError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    // Generic error - don't expose details
    return reply.status(500).send({
      error: "INTERNAL_ERROR",
      message: "An internal error occurred",
    });
  });
}
