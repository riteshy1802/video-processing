"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, Upload, ChevronRight } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();

  const getBreadcrumb = () => {
    if (pathname === "/") return "Home";
    if (pathname === "/dashboard") return "Video Library";
    if (pathname === "/upload") return "Upload New Video";
    if (pathname.startsWith("/video/")) return "Processing & Playback";
    return "Dashboard";
  };

  return (
    <header className="h-16 border-b border-slate-200/80 dark:border-slate-800/60 bg-white/80 dark:bg-[#070a12]/90 backdrop-blur sticky top-0 z-40 px-4 md:px-6 flex items-center justify-between shrink-0 transition-colors">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-sans">
        <Link href="/" className="text-slate-900 dark:text-slate-100 font-bold tracking-tight hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
          TRANSCODE.IO
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600 shrink-0" />
        <span className="text-sky-600 dark:text-sky-400 font-semibold">{getBreadcrumb()}</span>
      </div>

      {/* Right Controls: Mobile Nav & Theme Switcher */}
      <div className="flex items-center gap-3">
        {/* Mobile Navigation Links */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/dashboard"
            className={cn(
              "p-2 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer",
              pathname === "/dashboard"
                ? "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/30"
                : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
            )}
          >
            <Film className="h-4 w-4" />
            <span>Library</span>
          </Link>
          <Link
            href="/upload"
            className={cn(
              "p-2 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer",
              pathname === "/upload"
                ? "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/30"
                : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
            )}
          >
            <Upload className="h-4 w-4" />
            <span>Upload</span>
          </Link>
        </div>

        {/* Centralized Light/Dark Theme Switcher */}
        <ThemeToggle />
      </div>
    </header>
  );
}
