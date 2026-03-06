import { describe, expect, it } from "bun:test";
import { buildV0CreateChatInput } from "../../src/utils/history-bootstrap.js";

describe("history bootstrap", () => {
  it("keeps a normal first turn unchanged", () => {
    const result = buildV0CreateChatInput([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello there" },
    ]);

    expect(result.bootstrappedHistory).toBe(false);
    expect(result.message).toBe("Hello there");
    expect(result.system).toBe("You are helpful.");
  });

  it("bootstraps prior turns into system context on fallback create", () => {
    const result = buildV0CreateChatInput([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Who are you?" },
      { role: "assistant", content: "I am a proxy assistant." },
      { role: "user", content: "What is your cutoff?" },
    ]);

    expect(result.bootstrappedHistory).toBe(true);
    expect(result.message).toBe("What is your cutoff?");
    expect(result.system).toContain("You are helpful.");
    expect(result.system).toContain("USER: Who are you?");
    expect(result.system).toContain("ASSISTANT: I am a proxy assistant.");
    expect(result.system).not.toContain("USER: What is your cutoff?");
  });

  it("falls back to a synthetic user message when the latest turn is not user", () => {
    const result = buildV0CreateChatInput([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);

    expect(result.bootstrappedHistory).toBe(true);
    expect(result.message).toContain("Continue the conversation");
    expect(result.system).toContain("USER: Hello");
  });
});
