"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers, ArrowRight, Sparkles, BookOpen, Cpu, Gauge } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV_LINKS = [
  { id: "features", label: "Capabilities", icon: Sparkles },
  { id: "infrastructure", label: "Infrastructure", icon: Cpu },
  { id: "abr", label: "Adaptive Bitrate", icon: Gauge },
];

export function LandingNavbar() {
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    const sectionIds = ["features", "infrastructure", "abr"];
    const observerCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    const observerOptions: IntersectionObserverInit = {
      root: null,
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0.1,
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const scrollToSection = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      setActiveSection(id);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-slate-800/60 bg-white/80 dark:bg-[#070a12]/80 backdrop-blur-md transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 p-0.5 shadow-md group-hover:scale-105 transition-transform">
            <div className="h-full w-full bg-slate-900 rounded-[10px] flex items-center justify-center text-sky-400">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="font-sans text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1">
              TRANSCODE<span className="text-sky-600 dark:text-sky-400">.IO</span>
            </div>
            <p className="text-[10px] font-sans text-slate-500 dark:text-slate-400 tracking-wider uppercase font-medium hidden sm:block">
              Distributed VOD Cluster
            </p>
          </div>
        </Link>

        {/* Center Nav Links with Scroll Spy Active State */}
        <nav className="hidden md:flex items-center gap-2 text-xs font-sans font-medium">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = activeSection === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => scrollToSection(link.id, e)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-500/30 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900/60"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-sky-500" : "text-slate-400"}`} />
                <span>{link.label}</span>
              </a>
            );
          })}

          <Link
            href="/docs"
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5 text-purple-500" />
            <span>Documentation</span>
          </Link>
        </nav>

        {/* Right CTA & Theme Toggle */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-sm text-xs font-sans font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-md shadow-sky-500/20 hover:shadow-sky-500/30 transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <span>Dashboard</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
