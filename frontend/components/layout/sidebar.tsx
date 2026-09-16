"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, Upload, Layers, Server, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSidebar } from "./sidebar-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    name: "Video Library",
    href: "/",
    icon: Film,
  },
  {
    name: "Upload Video",
    href: "/upload",
    icon: Upload,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <aside
      className={cn(
        "border-r border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#070a12] flex flex-col justify-between hidden md:flex shrink-0 select-none transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div>
        {/* Brand / Logo + Single Sidebar Hamburger Toggle */}
        <div className={cn("h-16 flex items-center px-4 border-b border-slate-200/80 dark:border-slate-800/60 shrink-0", isCollapsed ? "justify-center" : "justify-between")}>
          {/* Logo icon + brand text: shown when expanded */}
          {!isCollapsed && (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="h-8 w-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                <Layers className="h-4 w-4" />
              </div>
              <div className="truncate">
                <div className="font-mono text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100 flex items-center gap-1">
                  TRANSCODE<span className="text-sky-600 dark:text-sky-400">.IO</span>
                </div>
                <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 tracking-wider uppercase">
                  Distributed VOD
                </p>
              </div>
            </div>
          )}

          {/* Single Hamburger Toggle Button with Custom Tooltip */}
          <Tooltip content={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"} position="right">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </Tooltip>
        </div>

        {/* Navigation Items */}
        <div className={cn("py-6 space-y-2 flex flex-col", isCollapsed ? "items-center px-2" : "px-3")}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = 
              item.href === "/" 
                ? pathname === "/"
                : pathname.startsWith(item.href);

            const linkElement = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer",
                  isActive
                    ? "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-500/20 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900/60",
                  isCollapsed ? "justify-center h-10 w-10 px-0 shrink-0" : "w-full"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sky-600 dark:text-sky-400" : "text-slate-400 dark:text-slate-500")} />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );

            return isCollapsed ? (
              <Tooltip key={item.href} content={item.name} position="right" containerClassName="w-full flex justify-center">
                {linkElement}
              </Tooltip>
            ) : (
              linkElement
            );
          })}
        </div>
      </div>

      {/* Infrastructure Status Footer */}
      <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/60 shrink-0">
        {isCollapsed ? (
          <Tooltip content="Pipeline Engine Ready" position="right" containerClassName="w-full flex justify-center">
            <div className="flex justify-center items-center h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </Tooltip>
        ) : (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-slate-900/40 p-3.5 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Pipeline Engine</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                READY
              </span>
            </div>
            
            {/* Resolutions stacked on next line */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider block font-semibold">
                Supported Renditions:
              </span>
              <div className="text-[11px] font-mono font-bold text-slate-900 dark:text-slate-200 tracking-tight">
                360p • 480p • 720p • 1080p • 1440p
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
