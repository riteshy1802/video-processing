"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
    if (saved) {
      setTheme(saved);
      applyTheme(saved);
    } else {
      applyTheme("dark");
    }
  }, []);

  const applyTheme = (newTheme: "light" | "dark" | "system") => {
    const root = document.documentElement;
    if (newTheme === "dark") {
      root.classList.add("dark");
    } else if (newTheme === "light") {
      root.classList.remove("dark");
    } else {
      // system
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  };

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  };

  if (!mounted) return null;

  return (
    <div className="flex items-center gap-0.5 p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 font-mono text-xs">
      <button
        onClick={() => handleThemeChange("light")}
        className={cn(
          "p-1.5 rounded flex items-center gap-1 transition-colors",
          theme === "light"
            ? "bg-white text-sky-600 shadow-sm font-semibold"
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        )}
        title="Light theme"
      >
        <Sun className="h-3.5 w-3.5" />
      </button>

      <button
        onClick={() => handleThemeChange("dark")}
        className={cn(
          "p-1.5 rounded flex items-center gap-1 transition-colors",
          theme === "dark"
            ? "bg-slate-800 text-sky-400 shadow-sm font-semibold"
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        )}
        title="Dark theme"
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
