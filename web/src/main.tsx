import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const themePreference =
  window.localStorage.getItem("v0-proxy-theme") || "system";
const resolvedTheme =
  themePreference === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : themePreference;

document.documentElement.classList.remove("light", "dark");
document.documentElement.classList.add(resolvedTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
