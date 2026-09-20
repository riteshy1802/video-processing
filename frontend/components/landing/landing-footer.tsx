"use client";

import Link from "next/link";
import { ArrowRight, Upload, Layers, Heart, Server } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#070a12] transition-colors">
      
      {/* Prominent High-Converting CTA Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950 p-8 md:p-14 text-white shadow-2xl overflow-hidden border border-slate-800">
          
          {/* Subtle Glow backdrop */}
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-sky-500/20 blur-3xl rounded-full pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-mono font-semibold">
              <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
              <span>Ready for Transcoding</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
              Start Processing Your Videos with Distributed HLS Pipelines
            </h2>

            <p className="text-slate-300 text-base sm:text-lg font-normal max-w-2xl leading-relaxed">
              Experience zero-buffering adaptive bitrate streaming, fault-tolerant worker node execution, and sub-minute transcode speeds.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/dashboard"
                className="px-6 py-3.5 rounded-xl font-mono text-sm font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/25 transition-all hover:-translate-y-0.5 flex items-center gap-2.5 cursor-pointer"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/upload"
                className="px-6 py-3.5 rounded-xl font-mono text-sm font-semibold text-slate-200 bg-slate-800/80 border border-slate-700 hover:bg-slate-800 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Upload className="h-4 w-4 text-sky-400" />
                <span>Upload New Video</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links & Copyright */}
      <div className="border-t border-slate-200/80 dark:border-slate-800/60 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 font-mono text-xs text-slate-500 dark:text-slate-400">
          
          {/* Logo & Copyright */}
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                TRANSCODE<span className="text-sky-600 dark:text-sky-400">.IO</span>
              </span>
              <span className="ml-2 text-slate-400 dark:text-slate-600">
                © {new Date().getFullYear()} All Rights Reserved.
              </span>
            </div>
          </div>

          {/* Quick Footer Navigation */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              Video Library
            </Link>
            <Link href="/upload" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              Upload Video
            </Link>
            <Link href="/docs" target="_blank" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              API Docs
            </Link>
            <a href="#architecture" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              Architecture
            </a>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-4">
            <ThemeToggle />
          </div>

        </div>
      </div>

    </footer>
  );
}
