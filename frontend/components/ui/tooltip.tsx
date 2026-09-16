"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
  containerClassName?: string;
}

export function Tooltip({
  content,
  children,
  position = "top",
  className,
  containerClassName,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionStyles = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className={cn("relative inline-flex items-center", containerClassName)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && content && (
        <div
          className={cn(
            "absolute z-50 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium whitespace-nowrap shadow-md pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95",
            "bg-slate-900 dark:bg-slate-100 text-slate-100 dark:text-slate-900 border border-slate-800 dark:border-slate-200",
            positionStyles[position],
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
