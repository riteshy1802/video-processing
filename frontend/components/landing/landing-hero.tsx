"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Upload, ShieldCheck, Zap, Activity, Cpu } from "lucide-react";

export function LandingHero() {
  return (
    <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
      {/* Dynamic Background Glow Elements for Light & Dark mode */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-sky-400/20 via-blue-500/10 to-purple-500/20 dark:from-sky-500/15 dark:via-blue-600/10 dark:to-indigo-500/15 blur-3xl pointer-events-none -z-10 rounded-full" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-emerald-400/10 dark:bg-emerald-500/10 blur-3xl pointer-events-none -z-10 rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8">
          
          {/* Left Column: Hero Text Content */}
          <div className="flex-1 text-center lg:text-left space-y-6">
            
            {/* Version Ticker Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-sky-200 dark:border-sky-500/30 bg-sky-50/80 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 text-xs font-mono font-semibold shadow-xs">
              <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
              <span>Fault-Tolerant HLS Pipeline Engine v2.0</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
              Distributed Video Transcoding at{" "}
              <span className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 dark:from-sky-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                Massive Scale
              </span>
            </h1>

            {/* Description */}
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto lg:mx-0 font-normal leading-relaxed">
              Parallel FFmpeg video transcoding into fault-tolerant, multi-bitrate HLS streams (360p to 1440p) with instant adaptive playback.
            </p>

            {/* CTA Action Buttons */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2">
              <Link
                href="/dashboard"
                className="px-6 py-3.5 rounded-md font-sans text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-lg shadow-sky-500/25 dark:shadow-sky-500/20 hover:shadow-sky-500/40 transition-all hover:-translate-y-0.5 flex items-center gap-2.5 group cursor-pointer"
              >
                <span>Launch Dashboard</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href="/upload"
                className="px-5 py-3.5 rounded-md font-sans text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-xs hover:border-slate-300 dark:hover:border-slate-700 flex items-center gap-2 cursor-pointer"
              >
                <Upload className="h-4 w-4 text-sky-500" />
                <span>Upload Video</span>
              </Link>
            </div>

            {/* Key Guarantees Pill Ticker */}
            <div className="pt-4 grid grid-cols-3 gap-3 border-t border-slate-200/80 dark:border-slate-800/60 max-w-lg mx-auto lg:mx-0 text-left font-sans text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Atomic S3 Commits</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                <span>Multi-Resolution HLS</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                <Cpu className="h-4 w-4 text-sky-500 shrink-0" />
                <span>Parallel FFmpeg Nodes</span>
              </div>
            </div>

          </div>

          {/* Right Column: Clean Illustration Card */}
          <div className="flex-1 w-full max-w-xl lg:max-w-none">
            <div className="relative rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 p-3 shadow-xl backdrop-blur-xl group hover:border-sky-500/40 transition-all duration-300">
              
              {/* Header Bar */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-3 font-sans text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-500/80" />
                  <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 font-semibold text-slate-700 dark:text-slate-200">
                    Transcode Pipeline Architecture
                  </span>
                </div>
              </div>

              {/* Main Clean Hero Illustration Image */}
              <div className="relative rounded-lg overflow-hidden aspect-[16/9] border border-slate-200/60 dark:border-slate-800 bg-slate-950">
                <Image
                  src="/images/landing_hero_illustration.jpg"
                  alt="Distributed Video Transcoding Architecture Illustration"
                  fill
                  className="object-cover group-hover:scale-102 transition-transform duration-500"
                  priority
                />
              </div>

              {/* Bottom Specs Bar */}
              <div className="mt-3 grid grid-cols-4 gap-2 text-center font-sans text-[11px]">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-400 dark:text-slate-500 text-[10px]">Segmenting</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 font-mono">2.0s ts</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-400 dark:text-slate-500 text-[10px]">Retry Logic</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">Idempotent</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-400 dark:text-slate-500 text-[10px]">Codec</div>
                  <div className="font-semibold text-sky-600 dark:text-sky-400 font-mono">H.264 / AAC</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-400 dark:text-slate-500 text-[10px]">Protocol</div>
                  <div className="font-semibold text-indigo-600 dark:text-indigo-400 font-mono">HLS m3u8</div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
