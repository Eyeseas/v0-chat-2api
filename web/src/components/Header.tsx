import { Link } from "react-router-dom";
import { Laptop, Moon, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemePreference = "light" | "dark" | "system";

interface HeaderProps {
  themePreference: ThemePreference;
  resolvedTheme: "light" | "dark";
  onThemePreferenceChange: (value: ThemePreference) => void;
}

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];

export function Header({
  themePreference,
  resolvedTheme,
  onThemePreferenceChange,
}: HeaderProps) {
  const onCycleTheme = () => {
    const currentIndex = THEME_ORDER.indexOf(themePreference);
    const next = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
    onThemePreferenceChange(next);
  };

  const themeLabel =
    themePreference === "system"
      ? `System (${resolvedTheme})`
      : themePreference === "dark"
        ? "Dark"
        : "Light";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight text-lg">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="hidden sm:inline">v0 Proxy Console</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground md:inline">
            OpenAI-compatible proxy for v0 chats
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCycleTheme}
            className="gap-2 border-border/70 bg-card/70 hover:bg-card"
            title={`Theme: ${themeLabel}`}
          >
            {themePreference === "system" ? (
              <Laptop className="h-4 w-4" />
            ) : resolvedTheme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{themeLabel}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
