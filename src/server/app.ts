import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "../config/index.js";
import { healthRoutes } from "./routes/health.js";
import { chatRoutes } from "./routes/chat.js";
import { internalRoutes } from "./routes/internal.js";
import { setupErrorHandler } from "../utils/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  });

  const serveWebUi = config.NODE_ENV !== "test" && config.SERVE_WEB_UI;

  if (serveWebUi) {
    const staticPath = join(__dirname, "../../web/dist");
    await app.register(fastifyStatic, {
      root: staticPath,
      prefix: "/",
      wildcard: false,
    });
  }

  setupErrorHandler(app);

  app.setNotFoundHandler((request, reply) => {
    const isSpaFallbackRoute =
      serveWebUi &&
      request.method === "GET" &&
      !request.url.startsWith("/v1/") &&
      !request.url.startsWith("/internal/");

    if (isSpaFallbackRoute) {
      return reply.type("text/html").sendFile("index.html");
    }

    return reply.status(404).send({
      error: "Not Found",
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  await app.register(healthRoutes);
  await app.register(chatRoutes);
  await app.register(internalRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof createApp>>;
