import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/internal/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      timestamp: Date.now(),
    });
  });
}
