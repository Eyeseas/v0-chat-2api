import { Header } from "./Header";
import { Navigation, MobileNavigation } from "./Navigation";

type ThemePreference = "light" | "dark" | "system";

interface LayoutProps {
  children: React.ReactNode;
  themePreference: ThemePreference;
  resolvedTheme: "light" | "dark";
  onThemePreferenceChange: (value: ThemePreference) => void;
}

export function Layout({
  children,
  themePreference,
  resolvedTheme,
  onThemePreferenceChange,
}: LayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_520px_at_5%_-10%,rgba(242,96,118,0.24),transparent_58%),radial-gradient(900px_440px_at_100%_0%,rgba(255,151,96,0.22),transparent_62%),radial-gradient(700px_380px_at_18%_100%,rgba(69,139,115,0.16),transparent_64%),linear-gradient(to_bottom,rgba(255,209,80,0.08),transparent_42%)]" />

      <Header
        themePreference={themePreference}
        resolvedTheme={resolvedTheme}
        onThemePreferenceChange={onThemePreferenceChange}
      />

      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        {/* Sidebar - Desktop only */}
        <aside className="hidden w-72 border-r border-border/70 bg-card/30 p-4 backdrop-blur-sm lg:block">
          <div className="sticky top-[5.25rem] flex h-[calc(100vh-6.5rem)] flex-col rounded-2xl border border-border/70 bg-card/55 p-4 shadow-sm">
            <div className="mb-4 space-y-1 px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Workspace
              </p>
              <h2 className="text-sm font-semibold text-foreground">Navigation</h2>
            </div>

            <Navigation />

            <div className="mt-auto rounded-xl border border-border/70 bg-background/55 p-3">
              <p className="text-xs font-semibold text-foreground">Live Console</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Conversations auto-refresh every 15s, with manual refresh available.
              </p>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-auto pb-24 lg:pb-8">
          <div className="px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">{children}</div>
        </main>
      </div>

      {/* Bottom Navigation - Mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-border/70 bg-background/85 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <MobileNavigation />
      </nav>
    </div>
  );
}
