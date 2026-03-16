const SUPPORTED_V0_MODELS = [
  "v0-auto",
  "v0-mini",
  "v0-pro",
  "v0-max",
  "v0-max-fast",
] as const;

export type SupportedV0Model = (typeof SUPPORTED_V0_MODELS)[number];

const MODEL_ALIASES: Record<string, SupportedV0Model> = {
  "claude-haiku-4-5-20251001": "v0-mini",
  "claude-haiku-4.5": "v0-mini",
  "haiku": "v0-mini",
  "claude-sonnet-4-6": "v0-pro",
  "claude-sonnet-4.6": "v0-pro",
  "sonnet": "v0-pro",
  "claude-opus-4-6": "v0-max",
  "claude-opus-4.6": "v0-max",
  "opus": "v0-max",
};

export function resolveModelId(model: string): SupportedV0Model | null {
  if (SUPPORTED_V0_MODELS.includes(model as SupportedV0Model)) {
    return model as SupportedV0Model;
  }
  return MODEL_ALIASES[model] ?? null;
}

export function mapModel(model: string): SupportedV0Model {
  return resolveModelId(model) ?? "v0-auto";
}

export { SUPPORTED_V0_MODELS, MODEL_ALIASES };
