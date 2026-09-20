"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  label: string;
  value: string;
}

interface PopoverDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  className?: string;
  placeholder?: string;
}

export function PopoverDropdown({
  value,
  onChange,
  options,
  className,
  placeholder = "Select Option",
}: PopoverDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2.5 rounded-sm border text-xs font-mono font-semibold transition-all cursor-pointer shadow-xs",
          "bg-slate-50 dark:bg-[#0b0f19] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700",
          isOpen && "border-sky-500 ring-2 ring-sky-500/10",
          className
        )}
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-44 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 font-mono text-xs animate-in fade-in zoom-in-95">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between transition-colors cursor-pointer",
                  isSelected
                    ? "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 font-bold"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80"
                )}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
