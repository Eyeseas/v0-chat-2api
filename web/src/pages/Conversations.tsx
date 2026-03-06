import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ConversationSummary {
  id: string;
  chatId: string;
  prefixHash: string;
  createdAt: number;
  updatedAt: number;
}

interface ConversationsResponse {
  data: ConversationSummary[];
  pagination: {
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
  };
}

interface MessageItem {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
  updatedAt?: string;
  finishReason?: string;
}

interface MessagesResponse {
  data: MessageItem[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
    nextUrl?: string;
  };
}

const LIST_LIMIT = 40;
const MESSAGE_LIMIT = 100;

function dedupeConversationsByChatId(
  items: ConversationSummary[]
): ConversationSummary[] {
  const map = new Map<string, ConversationSummary>();
  for (const item of items) {
    map.set(item.chatId, item);
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function sortMessagesByTime(messages: MessageItem[]): MessageItem[] {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function Conversations() {
  const [searchTerm, setSearchTerm] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listHasMore, setListHasMore] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesLoadingOlder, setMessagesLoadingOlder] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

  const fetchConversations = async (mode: "initial" | "refresh" | "more") => {
    if (mode === "refresh") {
      setListRefreshing(true);
    } else if (mode === "more") {
      setListLoadingMore(true);
    } else {
      setListLoading(true);
    }

    try {
      setListError(null);
      const offset = mode === "more" ? conversations.length : 0;
      const response = await fetch(
        `/internal/conversations?limit=${LIST_LIMIT}&offset=${offset}`
      );
      if (!response.ok) {
        throw new Error(`Conversations request failed (${response.status})`);
      }

      const json = (await response.json()) as ConversationsResponse;
      const incoming = json.data ?? [];
      const total = json.pagination?.total ?? incoming.length;
      const hasMore =
        json.pagination?.hasMore ?? offset + incoming.length < total;

      if (mode === "more") {
        setConversations((prev) =>
          dedupeConversationsByChatId([...prev, ...incoming])
        );
      } else {
        setConversations(dedupeConversationsByChatId(incoming));
      }
      setListTotal(total);
      setListHasMore(hasMore);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Failed to load conversations"
      );
    } finally {
      setListLoading(false);
      setListRefreshing(false);
      setListLoadingMore(false);
    }
  };

  const fetchMessages = async (
    chatId: string,
    cursor?: string,
    appendOlder = false
  ) => {
    if (appendOlder) {
      setMessagesLoadingOlder(true);
    } else {
      setMessagesLoading(true);
      setMessages([]);
      setMessagesError(null);
      setNextCursor(undefined);
    }

    try {
      const query = new URLSearchParams();
      query.set("limit", String(MESSAGE_LIMIT));
      if (cursor) {
        query.set("cursor", cursor);
      }

      const response = await fetch(
        `/internal/conversations/${encodeURIComponent(chatId)}/messages?${query.toString()}`
      );
      if (!response.ok) {
        throw new Error(`Messages request failed (${response.status})`);
      }

      const json = (await response.json()) as MessagesResponse;
      const incoming = sortMessagesByTime(json.data ?? []);

      setMessages((prev) => {
        const merged = appendOlder ? [...incoming, ...prev] : incoming;
        const unique = new Map<string, MessageItem>();
        for (const message of merged) {
          unique.set(message.id, message);
        }
        return sortMessagesByTime([...unique.values()]);
      });
      setNextCursor(json.pagination?.nextCursor);
    } catch (err) {
      setMessagesError(
        err instanceof Error ? err.message : "Failed to load message history"
      );
    } finally {
      setMessagesLoading(false);
      setMessagesLoadingOlder(false);
    }
  };

  useEffect(() => {
    void fetchConversations("initial");

    const interval = window.setInterval(() => {
      void fetchConversations("refresh");
    }, 15_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!conversations.length) {
      setSelectedChatId(null);
      return;
    }

    setSelectedChatId((current) => {
      if (current && conversations.some((conversation) => conversation.chatId === current)) {
        return current;
      }
      return conversations[0].chatId;
    });
  }, [conversations]);

  useEffect(() => {
    if (!selectedChatId) {
      return;
    }

    void fetchMessages(selectedChatId);
  }, [selectedChatId]);

  const handleDeleteConversation = async (chatId: string) => {
    const approved = window.confirm(
      `Delete conversation '${chatId}' from v0 and local mapping?`
    );
    if (!approved) {
      return;
    }

    setDeletingChatId(chatId);
    try {
      setListError(null);
      const response = await fetch(
        `/internal/conversations/${encodeURIComponent(chatId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`Delete request failed (${response.status})`);
      }

      const remaining = conversations.filter(
        (conversation) => conversation.chatId !== chatId
      );
      const nextTotal = Math.max(listTotal - 1, 0);

      setConversations(remaining);
      setListTotal(nextTotal);
      setListHasMore(remaining.length < nextTotal);

      if (selectedChatId === chatId) {
        setSelectedChatId(remaining[0]?.chatId ?? null);
        setMessages([]);
        setNextCursor(undefined);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to delete chat");
    } finally {
      setDeletingChatId(null);
    }
  };

  const filteredConversations = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      conversation.chatId.toLowerCase().includes(needle)
    );
  }, [conversations, searchTerm]);

  return (
    <div className="space-y-4 pb-3">
      <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur-sm sm:p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Conversations
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Browse local chat mappings and inspect message history from v0.
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold">
                Conversation List
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Loaded {conversations.length} / {listTotal}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Filter by chat ID"
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void fetchConversations("refresh")}
                disabled={listLoading || listRefreshing || listLoadingMore}
                title="Refresh conversations"
              >
                <RefreshCw
                  className={`h-4 w-4 ${listRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {listLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading conversations...
              </div>
            ) : null}

            {listError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {listError}
              </div>
            ) : null}

            {!listLoading && !filteredConversations.length ? (
              <div className="rounded-lg border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                No conversations found.
              </div>
            ) : null}

            <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
              {filteredConversations.map((conversation) => {
                const selected = selectedChatId === conversation.chatId;
                return (
                  <div
                    key={conversation.id}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/70 bg-background/50 hover:border-primary/40 hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedChatId(conversation.chatId)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-semibold">
                          {conversation.chatId}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Updated {new Date(conversation.updatedAt).toLocaleString()}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={deletingChatId === conversation.chatId}
                        onClick={() =>
                          void handleDeleteConversation(conversation.chatId)
                        }
                        title="Delete conversation"
                      >
                        {deletingChatId === conversation.chatId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {listHasMore ? (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => void fetchConversations("more")}
                  disabled={listLoadingMore || listLoading || listRefreshing}
                >
                  {listLoadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Load more conversations
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="truncate text-base font-semibold">
              {selectedChatId ? `Transcript · ${selectedChatId}` : "Transcript"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {!selectedChatId ? (
              <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
                Select a conversation to view transcript history.
              </div>
            ) : (
              <>
                {nextCursor ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void fetchMessages(selectedChatId, nextCursor, true)
                      }
                      disabled={messagesLoadingOlder}
                      className="gap-2"
                    >
                      {messagesLoadingOlder ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Load older messages
                    </Button>
                  </div>
                ) : null}

                {messagesLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading transcript...
                  </div>
                ) : null}

                {messagesError ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {messagesError}
                  </div>
                ) : null}

                {!messagesLoading && !messages.length ? (
                  <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
                    No messages returned for this chat.
                  </div>
                ) : null}

                <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
                  {messages.map((message) => {
                    const isUser = message.role === "user";
                    const isSystem = message.role === "system";
                    return (
                      <div
                        key={message.id}
                        className={`flex ${
                          isUser ? "justify-end" : "justify-start"
                        }`}
                      >
                        <article
                          className={`max-w-[90%] rounded-2xl border px-4 py-3 sm:max-w-[82%] ${
                            isUser
                              ? "border-sky-400/30 bg-sky-500/10"
                              : isSystem
                                ? "border-secondary/35 bg-secondary/10"
                                : "border-primary/35 bg-primary/10"
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span className="font-semibold capitalize">{message.role}</span>
                            <span>·</span>
                            <span>{new Date(message.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6">
                            {message.content?.trim() || "(empty message)"}
                          </p>
                        </article>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
