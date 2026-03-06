import type { CanonicalMessage } from "../types/conversation.js";

export interface V0CreateChatInput {
  message: string;
  system?: string;
  bootstrappedHistory: boolean;
}

const BOOTSTRAP_PREAMBLE = [
  "You are continuing a conversation that is being proxied from an OpenAI-style chat client.",
  "The prior transcript below is authoritative context for this new v0 chat.",
  "Do not mention this bootstrap process to the user unless they explicitly ask.",
].join("\n");

const EMPTY_USER_MESSAGE_FALLBACK =
  "Continue the conversation using the provided transcript and respond as the assistant.";

export function buildV0CreateChatInput(
  messages: CanonicalMessage[]
): V0CreateChatInput {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);

  const conversationalMessages = messages.filter(
    (message) => message.role !== "system"
  );

  const latestMessage = conversationalMessages.at(-1);
  const priorMessages = conversationalMessages.slice(0, -1);

  const baseSystem =
    systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined;

  if (priorMessages.length === 0) {
    return {
      message: latestMessage?.content ?? EMPTY_USER_MESSAGE_FALLBACK,
      system: baseSystem,
      bootstrappedHistory: false,
    };
  }

  const transcript = priorMessages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const sections = [
    baseSystem,
    BOOTSTRAP_PREAMBLE,
    "Prior conversation transcript:",
    transcript,
    latestMessage?.role === "user"
      ? "The current user message will be sent separately as the live chat message."
      : "The latest transcript turn is not a user message. Continue naturally from the transcript.",
  ].filter(Boolean);

  return {
    message:
      latestMessage?.role === "user"
        ? latestMessage.content
        : EMPTY_USER_MESSAGE_FALLBACK,
    system: sections.join("\n\n"),
    bootstrappedHistory: true,
  };
}
