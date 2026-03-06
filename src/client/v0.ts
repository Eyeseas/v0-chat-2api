import { config } from "../config/index.js";
import type {
  V0ChatResponse,
  V0ModelConfiguration,
  V0ResponseMode,
  V0StreamEvent,
} from "../types/v0.js";

const V0_API_BASE_URL = config.V0_API_BASE_URL;
const V0_API_KEY = config.V0_API_KEY;

export interface V0RateLimits {
  requestsRemaining: number;
  requestsLimit: number;
  requestsResetAt: string;
  tokensRemaining: number;
  tokensLimit: number;
  tokensResetAt: string;
}

export interface V0UserPlan {
  id: string;
  name: string;
  tier: string;
  features: string[];
  limits: {
    maxRequestsPerMonth: number;
    maxTokensPerMonth: number;
    maxChats: number;
  };
}

export interface V0UserBilling {
  subscriptionStatus: "active" | "inactive" | "past_due" | "cancelled";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  paymentMethod?: {
    type: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  };
}

export interface V0UsageReport {
  id: string;
  period: string;
  requestsUsed: number;
  tokensUsed: number;
  chatsCreated: number;
  generatedAt: string;
}

export interface V0MessageSummary {
  id: string;
  object?: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  updatedAt?: string;
  finishReason?: string;
  attachments?: Array<{
    url?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface V0MessageListResponse {
  object: "list";
  data: V0MessageSummary[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
    nextUrl?: string;
  };
}

class V0APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: unknown
  ) {
    super(message);
    this.name = "V0APIError";
  }
}

async function makeRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${V0_API_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${V0_API_KEY}`,
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    const errorMessage =
      typeof errorBody === "object" &&
      errorBody !== null &&
      "error" in errorBody &&
      typeof (errorBody as Record<string, unknown>).error === "object" &&
      (errorBody as Record<string, unknown>).error !== null &&
      "message" in ((errorBody as Record<string, unknown>).error as Record<string, unknown>)
        ? String(((errorBody as Record<string, unknown>).error as Record<string, unknown>).message)
        : `HTTP ${response.status}: ${response.statusText}`;

    throw new V0APIError(errorMessage, response.status, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function createChat(
  message: string,
  options?: {
    system?: string;
    modelConfiguration?: V0ModelConfiguration;
    responseMode?: V0ResponseMode;
    metadata?: Record<string, string>;
  }
): Promise<V0ChatResponse> {
  const body = {
    message,
    system: options?.system,
    modelConfiguration: options?.modelConfiguration,
    responseMode: options?.responseMode ?? "sync",
    metadata: options?.metadata,
  };

  return makeRequest<V0ChatResponse>("/chats", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function* createChatStream(
  message: string,
  options?: {
    system?: string;
    modelConfiguration?: V0ModelConfiguration;
    metadata?: Record<string, string>;
  }
): AsyncGenerator<V0StreamEvent, void, unknown> {
  const url = `${V0_API_BASE_URL}/chats`;

  const body = {
    message,
    system: options?.system,
    modelConfiguration: options?.modelConfiguration,
    responseMode: "experimental_stream" as const,
    metadata: options?.metadata,
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${V0_API_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    const errorMessage =
      typeof errorBody === "object" &&
      errorBody !== null &&
      "error" in errorBody &&
      typeof (errorBody as Record<string, unknown>).error === "object" &&
      (errorBody as Record<string, unknown>).error !== null &&
      "message" in ((errorBody as Record<string, unknown>).error as Record<string, unknown>)
        ? String(((errorBody as Record<string, unknown>).error as Record<string, unknown>).message)
        : `HTTP ${response.status}: ${response.statusText}`;

    throw new V0APIError(errorMessage, response.status, errorBody);
  }

  if (!response.body) {
    throw new V0APIError("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          try {
            const event = JSON.parse(data) as V0StreamEvent;
            yield event;
          } catch {
            /* skip invalid JSON */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* sendMessageStream(
  chatId: string,
  message: string,
  options?: {
    system?: string;
    modelConfiguration?: V0ModelConfiguration;
  }
): AsyncGenerator<V0StreamEvent, void, unknown> {
  const url = `${V0_API_BASE_URL}/chats/${encodeURIComponent(chatId)}/messages`;

  const body = {
    message,
    system: options?.system,
    modelConfiguration: options?.modelConfiguration,
    responseMode: "experimental_stream" as const,
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${V0_API_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    const errorMessage =
      typeof errorBody === "object" &&
      errorBody !== null &&
      "error" in errorBody &&
      typeof (errorBody as Record<string, unknown>).error === "object" &&
      (errorBody as Record<string, unknown>).error !== null &&
      "message" in ((errorBody as Record<string, unknown>).error as Record<string, unknown>)
        ? String(((errorBody as Record<string, unknown>).error as Record<string, unknown>).message)
        : `HTTP ${response.status}: ${response.statusText}`;

    throw new V0APIError(errorMessage, response.status, errorBody);
  }

  if (!response.body) {
    throw new V0APIError("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          try {
            const event = JSON.parse(data) as V0StreamEvent;
            yield event;
          } catch {
            /* skip invalid JSON */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function sendMessage(
  chatId: string,
  message: string,
  options?: {
    system?: string;
    modelConfiguration?: V0ModelConfiguration;
    responseMode?: V0ResponseMode;
  }
): Promise<V0ChatResponse> {
  const body = {
    message,
    system: options?.system,
    modelConfiguration: options?.modelConfiguration,
    responseMode: options?.responseMode ?? "sync",
  };

  return makeRequest<V0ChatResponse>(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getChat(chatId: string): Promise<V0ChatResponse> {
  return makeRequest<V0ChatResponse>(`/chats/${encodeURIComponent(chatId)}`);
}

export async function deleteChat(chatId: string): Promise<void> {
  await makeRequest<void>(`/chats/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
}

export async function getChatMessages(
  chatId: string,
  options?: { limit?: number; cursor?: string }
): Promise<V0MessageListResponse> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  const query = params.toString();
  const path = `/chats/${encodeURIComponent(chatId)}/messages${query ? `?${query}` : ""}`;
  return makeRequest<V0MessageListResponse>(path);
}

export async function getRateLimits(): Promise<V0RateLimits> {
  return makeRequest<V0RateLimits>("/rate-limits");
}

export async function getUserPlan(): Promise<V0UserPlan> {
  return makeRequest<V0UserPlan>("/user/plan");
}

export async function getUserBilling(): Promise<V0UserBilling> {
  return makeRequest<V0UserBilling>("/user/billing");
}

export async function getUsageReports(limit?: number): Promise<V0UsageReport[]> {
  const params = limit !== undefined ? `?limit=${limit}` : "";
  return makeRequest<V0UsageReport[]>(`/reports/usage${params}`);
}

export { V0APIError };
