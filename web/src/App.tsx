import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Conversations, Home, Usage } from "./pages";

type ThemePreference = "light" | "dark" | "system";
const THEME_STORAGE_KEY = "v0-proxy-theme";

function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") {
    return saved;
  }
  return "system";
}

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function App() {
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(readThemePreference);
  const resolvedTheme = useMemo(
    () => resolveTheme(themePreference),
    [themePreference]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);

    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [themePreference, resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined" || themePreference !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(resolveTheme("system"));
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [themePreference]);

  return (
    <BrowserRouter>
      <Layout
        themePreference={themePreference}
        resolvedTheme={resolvedTheme}
        onThemePreferenceChange={setThemePreference}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/sql" element={<Navigate to="/conversations" replace />} />
          <Route path="/capacity" element={<Navigate to="/usage" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App
