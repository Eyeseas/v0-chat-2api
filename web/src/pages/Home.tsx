import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ConversationSummary {
  id: string;
  chatId: string;
  updatedAt: number;
  createdAt: number;
}

interface ConversationsResponse {
  data: ConversationSummary[];
  pagination: {
    total: number;
  };
}

interface CapacityResponse {
  rateLimits?: {
    remaining?: number;
    limit?: number;
  } | null;
}

export function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [totalConversations, setTotalConversations] = useState(0);
  const [capacity, setCapacity] = useState<CapacityResponse["rateLimits"]>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      setError(null);
      const [conversationsRes, capacityRes] = await Promise.all([
        fetch("/internal/conversations?limit=20&offset=0"),
        fetch("/internal/capacity"),
      ]);

      if (!conversationsRes.ok) {
        throw new Error(`Conversations request failed (${conversationsRes.status})`);
      }
      if (!capacityRes.ok) {
        throw new Error(`Capacity request failed (${capacityRes.status})`);
      }

      const conversationsData =
        (await conversationsRes.json()) as ConversationsResponse;
      const capacityData = (await capacityRes.json()) as CapacityResponse;

      setConversations(conversationsData.data ?? []);
      setTotalConversations(conversationsData.pagination?.total ?? 0);
      setCapacity(capacityData.rateLimits ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchOverview(false);
  }, []);

  const latestConversationTime = useMemo(() => {
    if (!conversations.length) {
      return "No conversations yet";
    }

    const latest = conversations[0];
    return new Date(latest.updatedAt).toLocaleString();
  }, [conversations]);

  return (
    <div className="space-y-6 pb-3">
      <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Live Proxy Overview
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Conversation Dashboard
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Monitor recent chat activity and navigate to conversation or usage views.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void fetchOverview(true)}
            disabled={isLoading || isRefreshing}
            className="gap-2 border-border/70 bg-background/70"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </section>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-base">Unable to load overview</CardTitle>
            <CardDescription className="text-destructive/90">
              {error}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>Total Conversations</CardDescription>
            <CardTitle className="flex items-end gap-2 text-3xl">
              {isLoading ? "--" : totalConversations}
              <MessageSquare className="mb-1 h-5 w-5 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Persisted in local SQLite mapping state.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>Latest Activity</CardDescription>
            <CardTitle className="flex items-end gap-2 text-xl sm:text-2xl">
              <Clock3 className="mb-1 h-5 w-5 text-primary" />
              {isLoading ? "--" : latestConversationTime}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Timestamp reflects the newest `updatedAt` entry.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 sm:col-span-2 xl:col-span-1">
          <CardHeader className="pb-3">
            <CardDescription>Rate Limit Snapshot</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "--" : `${capacity?.remaining ?? "--"} / ${capacity?.limit ?? "--"}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Remaining requests from v0 `/rate-limits`.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Open Pane</CardTitle>
            <CardDescription>
              Choose which pane to inspect next.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link to="/conversations">
                Open Conversations
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/usage">
                Open Usage
                <Wallet className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
