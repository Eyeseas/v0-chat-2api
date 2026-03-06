import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, MessageSquareText, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: "/", label: "Overview", icon: <LayoutDashboard className="h-5 w-5" /> },
  { path: "/usage", label: "Usage", icon: <Wallet className="h-5 w-5" /> },
  {
    path: "/conversations",
    label: "Conversations",
    icon: <MessageSquareText className="h-5 w-5" />,
  },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="flex flex-col gap-2">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "border-primary/45 bg-gradient-to-r from-primary/95 to-secondary/85 text-primary-foreground shadow-lg shadow-primary/20"
                : "border-transparent text-muted-foreground hover:border-border/80 hover:bg-accent/25 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                isActive
                  ? "bg-white/12 text-primary-foreground"
                  : "bg-card/70 text-muted-foreground group-hover:text-foreground"
              )}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavigation() {
  const location = useLocation();

  return (
    <nav className="flex items-center justify-around py-2">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "rounded-lg p-1.5",
                isActive ? "bg-primary/20" : "bg-transparent"
              )}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
