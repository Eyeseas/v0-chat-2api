import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface UsageEvent {
  id: string;
  type: string;
  totalCost?: string;
  promptCost?: string;
  completionCost?: string;
  createdAt: string;
  chatId?: string;
  messageId?: string;
}

interface CapacityResponse {
  rateLimits?: {
    remaining?: number;
    limit?: number;
    reset?: number;
  } | null;
  plan?: {
    balance?: {
      remaining?: number;
      total?: number;
    };
  } | null;
  usage?: {
    recent?: {
      data?: UsageEvent[];
    };
  };
}

export function Usage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<CapacityResponse["rateLimits"]>(null);
  const [planBalance, setPlanBalance] =
    useState<CapacityResponse["plan"]>(null);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);

  const fetchUsage = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      setError(null);
      const response = await fetch("/internal/capacity");
      if (!response.ok) {
        throw new Error(`Capacity request failed (${response.status})`);
      }

      const data = (await response.json()) as CapacityResponse;
      setCapacity(data.rateLimits ?? null);
      setPlanBalance(data.plan ?? null);
      setUsageEvents(data.usage?.recent?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchUsage(false);
  }, []);

  const recentUsageSpend = useMemo(() => {
    return usageEvents.reduce((sum, event) => {
      const value = Number(event.totalCost ?? "0");
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [usageEvents]);

  const latestUsageTime = useMemo(() => {
    if (!usageEvents.length) {
      return "No usage events yet";
    }
    return new Date(usageEvents[0].createdAt).toLocaleString();
  }, [usageEvents]);

  const balanceText = useMemo(() => {
    const remaining = planBalance?.balance?.remaining;
    const total = planBalance?.balance?.total;

    if (typeof remaining !== "number" || typeof total !== "number") {
      return "--";
    }

    return `$${remaining.toFixed(2)} / $${total.toFixed(2)}`;
  }, [planBalance]);

  return (
    <div className="space-y-6 pb-3">
      <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              API Usage
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Live usage and balance from the currently configured v0 API key.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void fetchUsage(true)}
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
            <CardTitle className="text-base">Unable to load usage</CardTitle>
            <CardDescription className="text-destructive/90">
              {error}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>Rate Limit</CardDescription>
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

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>API Key Balance</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "--" : balanceText}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Remaining / total budget for current billing cycle.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 sm:col-span-2 xl:col-span-1">
          <CardHeader className="pb-3">
            <CardDescription>Recent Spend (20)</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "--" : `$${recentUsageSpend.toFixed(4)}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sum of latest usage events.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 sm:col-span-2 xl:col-span-1">
          <CardHeader className="pb-3">
            <CardDescription>Last Event</CardDescription>
            <CardTitle className="text-lg">
              {isLoading ? "--" : latestUsageTime}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Timestamp of newest usage report entry.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Recent Events</CardTitle>
            <CardDescription>
              Event-level spend from v0 usage reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading usage events...
              </div>
            ) : null}

            {!isLoading && usageEvents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                No usage events returned.
              </div>
            ) : null}

            <div className="space-y-2">
              {usageEvents.map((event) => (
                <article
                  key={event.id}
                  className="rounded-xl border border-border/70 bg-background/55 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        Chat {event.chatId ?? "-"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Message {event.messageId ?? "-"}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-sm font-semibold">
                        ${Number(event.totalCost ?? "0").toFixed(6)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
