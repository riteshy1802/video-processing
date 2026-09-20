"use client";

import Image from "next/image";
import { Gauge, Smartphone, Monitor, Signal } from "lucide-react";

const RESOLUTION_SPECS = [
  { res: "1440p QHD", width: "2560x1440", bitrate: "8.5 Mbps", fps: "60 fps", target: "Desktop & 2K Displays" },
  { res: "1080p Full HD", width: "1920x1080", bitrate: "5.0 Mbps", fps: "60 fps", target: "Smart TVs & Laptops" },
  { res: "720p HD", width: "1280x720", bitrate: "2.8 Mbps", fps: "30 fps", target: "Tablets & Web Browsers" },
  { res: "480p SD", width: "854x480", bitrate: "1.4 Mbps", fps: "30 fps", target: "Mobile 4G Connectivity" },
  { res: "360p Mobile", width: "640x360", bitrate: "800 Kbps", fps: "30 fps", target: "Low Bandwidth / 3G" },
];

export function AbrShowcaseSection() {
  return (
    <section id="abr" className="py-16 md:py-24 bg-white dark:bg-[#090d16] border-t border-slate-200/80 dark:border-slate-800/60 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Text & Spec Matrix */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-300 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 text-xs font-mono font-semibold">
              <Gauge className="h-3.5 w-3.5 text-sky-500" />
              <span>Adaptive Streaming Technology</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Seamless Playback Across Any Device & Network Speed
            </h2>

            <p className="text-base text-slate-600 dark:text-slate-300 font-normal leading-relaxed">
              When a viewer clicks play, our adaptive player evaluates their real-time internet connection and dynamically adjusts video quality—delivering maximum crispness without buffering pauses.
            </p>

            {/* Resolution Table */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden font-mono text-xs shadow-sm">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800/80 font-bold text-slate-700 dark:text-slate-300 flex justify-between">
                <span>Rendition Quality</span>
                <span className="text-sky-600 dark:text-sky-400">Target Bitrate</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {RESOLUTION_SPECS.map((spec) => (
                  <div
                    key={spec.res}
                    className="p-3.5 flex items-center justify-between hover:bg-sky-50/80 dark:hover:bg-sky-500/10 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                        {spec.res}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">({spec.width})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">{spec.target}</span>
                      <span className="px-2.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30 font-bold text-[11px]">
                        {spec.bitrate}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Devices Pill Ticker */}
            <div className="flex flex-wrap items-center gap-6 pt-2 text-xs font-mono text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-sky-500" />
                <span>Smart TVs & Desktops</span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-emerald-500" />
                <span>iOS & Android</span>
              </div>
              <div className="flex items-center gap-2">
                <Signal className="h-4 w-4 text-purple-500" />
                <span>Auto Quality Failover</span>
              </div>
            </div>

          </div>

          {/* Right Column: Illustration Card */}
          <div className="lg:col-span-6">
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-900 p-2 shadow-2xl overflow-hidden group">
              <div className="relative aspect-[16/9] rounded-xl overflow-hidden">
                <Image
                  src="/images/abr_streaming_illustration.jpg"
                  alt="Adaptive Bitrate Streaming Player Illustration"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
