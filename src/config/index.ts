import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const configSchema = z.object({
  V0_API_KEY: z.string().min(1, "V0_API_KEY is required"),
  V0_API_BASE_URL: z
    .string()
    .url("V0_API_BASE_URL must be a valid URL")
    .default("https://api.v0.dev/v1"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive())
    .default("3000"),
  OPENAI_API_KEY: z.string().optional(),
  CHAT_STATE_FILE: z.string().default(".data/chat-state.db"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parseResult = configSchema.safeParse(process.env);

if (!parseResult.success) {
  const errors = parseResult.error.errors
    .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
    .join("\n");
  throw new Error(`Configuration validation failed:\n${errors}`);
}

export const config = parseResult.data;

export type Config = z.infer<typeof configSchema>;
