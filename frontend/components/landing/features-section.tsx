"use client";

import { Sparkles, Layers, Zap, ShieldCheck, PlayCircle, Gauge, Code2 } from "lucide-react";

const FEATURES = [
  {
    icon: Layers,
    title: "Automated Multi-Resolution Streaming",
    desc: "Prepares your video in 360p, 480p, 720p, 1080p, and 1440p resolutions automatically so every viewer enjoys the best quality for their device.",
    badge: "Multi-Resolution",
    color: "from-sky-500 to-blue-600",
  },
  {
    icon: Zap,
    title: "High-Speed Transcoding Engine",
    desc: "Parallel video processing architecture ensures your uploaded videos are ready for streaming in minutes rather than hours.",
    badge: "Parallel Engine",
    color: "from-blue-500 to-indigo-600",
  },
  {
    icon: ShieldCheck,
    title: "Guaranteed Playback Integrity",
    desc: "Advanced file verification ensures every segment is published cleanly—guaranteeing zero corrupted media or broken streams.",
    badge: "100% Reliable",
    color: "from-emerald-500 to-teal-600",
  },
  {
    icon: PlayCircle,
    title: "Built-In Instant Web Player",
    desc: "Preview and share your processed video assets immediately with custom controls, manual quality selector, and full screen mode.",
    badge: "Instant Preview",
    color: "from-purple-500 to-indigo-600",
  },
  {
    icon: Gauge,
    title: "Buffer-Free Adaptive Bitrate",
    desc: "Dynamic quality switching automatically adapts to changing viewer network speeds so video playback never buffers or stutters.",
    badge: "Zero Buffering",
    color: "from-amber-500 to-orange-600",
  },
  {
    icon: Code2,
    title: "Developer Ready API & Documentation",
    desc: "Full developer control with comprehensive REST API endpoints, real-time status tracking, and interactive documentation.",
    badge: "Developer API",
    color: "from-rose-500 to-pink-600",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-16 md:py-24 bg-slate-50/70 dark:bg-[#070a12] border-t border-slate-200/80 dark:border-slate-800/60 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-mono font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Platform Capabilities</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Everything You Need for Enterprise VOD Processing
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-400 font-normal">
            Built to deliver seamless video transcoding, instant playback, and crystal-clear streaming across all devices.
          </p>
        </div>

        {/* 6 Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-6 shadow-sm hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-sky-500/5 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Top Bar with Icon & Badge */}
                  <div className="flex items-center justify-between">
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feature.color} p-0.5 shadow-md group-hover:scale-110 transition-transform`}>
                      <div className="h-full w-full bg-slate-900 rounded-[10px] flex items-center justify-center text-white">
                        <Icon className="h-6 w-6" />
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {feature.badge}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                    {feature.desc}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/60 font-mono text-[11px] text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Learn more in docs →</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
