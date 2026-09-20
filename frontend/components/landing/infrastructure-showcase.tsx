"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Cpu,
  HardDrive,
  Server,
  Layers,
  Code2,
  Cloud,
  CheckCircle2,
  ArrowRight,
  ChevronDown,
  Zap,
  Play,
  ShieldCheck,
  Smartphone,
  Globe,
  Activity,
} from "lucide-react";

interface InfraItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  details: string;
  icon: any;
  color: string;
  badge: string;
  specTitle: string;
  specValue: string;
  previewType: "ffmpeg" | "atomic" | "kafka" | "hls" | "sse" | "cdn";
}

const INFRA_ITEMS: InfraItem[] = [
  {
    id: "ffmpeg",
    title: "Ultra-Fast Parallel Transcoding",
    category: "High Speed Encoding",
    summary: "Process 4K and 1080p videos using parallel chunk workers.",
    details: "Your uploaded videos are split into intelligent segments and encoded concurrently across dedicated worker nodes, turning long processing wait times into sub-minute completions.",
    icon: Zap,
    color: "from-sky-500 to-blue-600",
    badge: "Parallel Encoding",
    specTitle: "Performance",
    specValue: "Parallel Multi-Thread",
    previewType: "ffmpeg",
  },
  {
    id: "atomic",
    title: "Zero-Corruption Video Storage",
    category: "Data Integrity",
    summary: "Complete data protection with verified atomic commits.",
    details: "Every video segment is validated before publishing to cloud storage, guaranteeing that your audience never experiences broken streams or corrupted media playback.",
    icon: ShieldCheck,
    color: "from-emerald-500 to-teal-600",
    badge: "100% Reliable",
    specTitle: "Storage Protection",
    specValue: "Verified Atomic Commits",
    previewType: "atomic",
  },
  {
    id: "kafka",
    title: "High-Concurrency Upload Queue",
    category: "Traffic Management",
    summary: "Smooth workload management during peak upload traffic.",
    details: "Intelligent queue management distributes video processing evenly across available cloud resources so multiple creators can upload at the exact same time without slowdowns.",
    icon: Server,
    color: "from-indigo-500 to-purple-600",
    badge: "Instant Queueing",
    specTitle: "Concurrency",
    specValue: "Scalable Cluster",
    previewType: "kafka",
  },
  {
    id: "sse",
    title: "Instant Live Progress Notifications",
    category: "Real-Time Tracking",
    summary: "Watch processing milestones unfold live on your dashboard.",
    details: "Stay informed with real-time status notifications as your video moves through encoding stages, letting you know the exact instant your playback URL is ready.",
    icon: Activity,
    color: "from-rose-500 to-pink-600",
    badge: "Real-Time Updates",
    specTitle: "Dashboard Sync",
    specValue: "Instant Live Feed",
    previewType: "sse",
  },
  {
    id: "cdn",
    title: "Global Edge Streaming Delivery",
    category: "Worldwide Playback",
    summary: "Sub-second video playback start times globally.",
    details: "Video playlists and media segments are cached near your audience worldwide, ensuring instant video start times, zero buffering pauses, and seamless playback anywhere.",
    icon: Globe,
    color: "from-cyan-500 to-blue-500",
    badge: "Global Edge Delivery",
    specTitle: "Global Network",
    specValue: "Edge Fast Cache",
    previewType: "cdn",
  },
];

export function InfrastructureShowcase() {
  const [activeItem, setActiveItem] = useState<InfraItem>(INFRA_ITEMS[0]);

  return (
    <section id="infrastructure" className="py-20 md:py-28 bg-slate-50/60 dark:bg-[#090d16] border-t border-slate-200/80 dark:border-slate-800/60 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-sky-300 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 text-xs font-mono font-semibold">
            <Cpu className="h-3.5 w-3.5 text-sky-500" />
            <span>Platform Features</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Designed for Seamless Video Publishing & Performance
          </h2>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
            Hover or tap any platform feature on the left to explore its interactive visual preview on the right.
          </p>
        </div>

        {/* 2-Column Showcase Layout: Left White-Themed Accordion List | Right Dynamic Preview Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column (6 cols): White-Themed Accordion List in Light Mode */}
          <div className="lg:col-span-6 space-y-3 font-sans">
            {INFRA_ITEMS.map((item) => {
              const Icon = item.icon;
              const isSelected = item.id === activeItem.id;
              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setActiveItem(item)}
                  onClick={() => setActiveItem(item)}
                  className={`group rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                    isSelected
                      ? "bg-white dark:bg-slate-900/90 border-sky-500 dark:border-sky-500/60 shadow-lg ring-1 ring-sky-500/20"
                      : "bg-white dark:bg-slate-950/50 border-slate-200/90 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
                  }`}
                >
                  {/* Collapsed Header Bar */}
                  <div className="p-4 md:p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${item.color} p-0.5 shadow-sm shrink-0`}>
                        <div className="h-full w-full bg-white dark:bg-slate-950 rounded-[10px] flex items-center justify-center text-slate-900 dark:text-white">
                          <Icon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={`font-bold text-sm md:text-base transition-colors ${
                            isSelected ? "text-sky-600 dark:text-sky-400" : "text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400"
                          }`}>
                            {item.title}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.summary}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg shrink-0 border ${
                        isSelected
                          ? "bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-400/40"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      }`}>
                        {item.badge}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${isSelected ? "rotate-180 text-sky-500" : ""}`} />
                    </div>
                  </div>

                  {/* Smooth Accordion Height Expansion Container */}
                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      isSelected ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-slate-800/80 space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                        <p>{item.details}</p>
                        <div className="flex items-center justify-between font-mono text-[11px] pt-2.5 border-t border-slate-100 dark:border-slate-800/60 text-sky-600 dark:text-sky-400 font-semibold">
                          <span>Feature: {item.specTitle}</span>
                          <span>{item.specValue}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Right Column (6 cols): Dynamic Illustration / Component Graphic Preview (Dark Styled Panel Kept Intact) */}
          <div className="lg:col-span-6 sticky top-24">
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white p-6 shadow-2xl space-y-6 font-mono overflow-hidden">
              
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-sky-400 animate-pulse" />
                  <span className="font-bold text-slate-200 uppercase tracking-wider">
                    {activeItem.category}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-sky-400 text-[11px] font-bold">
                  {activeItem.specValue}
                </span>
              </div>

              {/* Dynamic Preview Graphic Content based on activeItem */}
              <div className="relative rounded-2xl border border-slate-800 bg-slate-900/90 p-5 min-h-[340px] flex flex-col justify-between overflow-hidden">
                
                {/* PREVIEW 1: Parallel Processing Speed */}
                {activeItem.previewType === "ffmpeg" && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                      <span className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-sky-400" />
                        <span>Parallel Processing Clusters</span>
                      </span>
                      <span className="text-emerald-400 font-bold">Parallel Encoding Pipeline</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {["1080p Full HD", "720p HD", "480p SD", "360p Mobile"].map((res, i) => (
                        <div key={res} className="p-3 rounded-xl border border-slate-800 bg-slate-950/80 space-y-2">
                          <div className="flex justify-between text-[11px] text-slate-300 font-bold">
                            <span>{res}</span>
                            <span className="text-sky-400 font-mono">Parallel</span>
                          </div>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-sky-400 to-blue-500 animate-pulse" style={{ width: `${(i + 1) * 25}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs flex items-center justify-between font-mono">
                      <span>Multi-Resolution Ladder</span>
                      <span className="font-bold">Automated</span>
                    </div>
                  </div>
                )}

                {/* PREVIEW 2: Zero Corruption Storage */}
                {activeItem.previewType === "atomic" && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        <span>Storage Data Verification</span>
                      </span>
                      <span className="text-emerald-400 font-bold">Zero Corrupted Files</span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-between">
                        <span className="text-slate-400">1. Fragment Ingestion:</span>
                        <span className="text-amber-400 font-bold">Validated</span>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-between">
                        <span className="text-slate-400">2. Media Checksum:</span>
                        <span className="text-sky-400 font-bold">100% Passed</span>
                      </div>
                      <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center justify-between font-bold">
                        <span>3. Master Playlist Publishing:</span>
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Published</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PREVIEW 3: Upload Queue */}
                {activeItem.previewType === "kafka" && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                      <span className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-purple-400" />
                        <span>High-Concurrency Queue Manager</span>
                      </span>
                      <span className="text-purple-400 font-bold">Auto-Load Balanced</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 flex items-center justify-between">
                        <span className="text-purple-300 font-bold">Upload Traffic Manager</span>
                        <span className="text-slate-400 font-mono">Distributed</span>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-between">
                        <span className="text-slate-300">Creator Stream 1</span>
                        <span className="text-emerald-400 font-bold">ACTIVE</span>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-between">
                        <span className="text-slate-300">Creator Stream 2</span>
                        <span className="text-emerald-400 font-bold">ACTIVE</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PREVIEW 4: HLS Engine Illustration */}
                {activeItem.previewType === "hls" && (
                  <div className="space-y-3 animate-fadeIn">
                    <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-slate-800">
                      <Image
                        src="/images/abr_streaming_illustration.jpg"
                        alt="Adaptive Bitrate Streaming Illustration"
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-sky-400 font-bold">
                      <span>Multi-Bitrate HLS Ladder</span>
                      <span>1440p • 1080p • 720p • 480p • 360p</span>
                    </div>
                  </div>
                )}

                {/* PREVIEW 5: Real-Time Live Status */}
                {activeItem.previewType === "sse" && (
                  <div className="space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Activity className="h-4 w-4 text-rose-400" />
                        <span>Live Dashboard Feed</span>
                      </span>
                      <span className="text-rose-400 font-bold">SYNCED</span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-800 bg-black font-mono text-[11px] text-slate-300 space-y-2">
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Transcode Progress:</span>
                        <span className="text-sky-400 font-bold">85% Completed</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-400" style={{ width: "85%" }} />
                      </div>
                      <div className="text-emerald-400 flex items-center gap-1 text-[10px]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>1080p HLS rendition ready for playback</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PREVIEW 6: Edge CDN Delivery */}
                {activeItem.previewType === "cdn" && (
                  <div className="space-y-3 animate-fadeIn">
                    <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-slate-800">
                      <Image
                        src="/images/global_cdn_edge_illustration.jpg"
                        alt="Global Edge CDN Delivery Illustration"
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-emerald-400 font-bold">
                      <span>Global Edge Cache Network</span>
                      <span>Zero Playback Delay</span>
                    </div>
                  </div>
                )}

                {/* Bottom Active Summary Bar */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Feature: <span className="text-slate-100 font-bold">{activeItem.title}</span></span>
                  <span className="text-sky-400 font-bold flex items-center gap-1">
                    <span>Overview</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>

              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
