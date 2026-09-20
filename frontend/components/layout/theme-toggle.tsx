"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState<boolean>(true);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    if (saved) {
      const darkState = saved === "dark";
      setIsDark(darkState);
      applyTheme(darkState);
    } else {
      const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      // Default to dark mode per design identity if not specified
      const darkState = isSystemDark || true;
      setIsDark(darkState);
      applyTheme(darkState);
    }
  }, []);

  const applyTheme = (dark: boolean) => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  };

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    localStorage.setItem("theme", nextDark ? "dark" : "light");
    applyTheme(nextDark);
  };

  if (!mounted) {
    return (
      <div className="h-8 w-14 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 opacity-60" />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "group relative flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-all duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950",
        isDark
          ? "border-sky-500/30 bg-slate-950 shadow-inner hover:border-sky-400/60 hover:shadow-sky-500/10"
          : "border-amber-300 bg-slate-100 shadow-inner hover:border-amber-400 hover:shadow-amber-500/10",
        className
      )}
      title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
      aria-label={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
    >
      {/* Background Track Icons */}
      <span className="absolute left-1.5 flex h-5 w-5 items-center justify-center text-amber-500/70 transition-opacity duration-300">
        <Sun className="h-3.5 w-3.5" />
      </span>
      <span className="absolute right-1.5 flex h-5 w-5 items-center justify-center text-sky-400/70 transition-opacity duration-300">
        <Moon className="h-3.5 w-3.5" />
      </span>

      {/* Sliding Thumb Knob */}
      <span
        className={cn(
          "relative z-10 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ease-spring shadow-md group-hover:scale-105",
          isDark
            ? "translate-x-6 bg-slate-900 text-sky-400 border border-sky-400/30 shadow-sky-500/20"
            : "translate-x-0 bg-white text-amber-500 border border-amber-200 shadow-amber-500/20"
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 rotate-0 transition-transform duration-500 group-hover:-rotate-12" />
        ) : (
          <Sun className="h-3.5 w-3.5 rotate-0 transition-transform duration-500 group-hover:rotate-45" />
        )}
      </span>
    </button>
  );
}

