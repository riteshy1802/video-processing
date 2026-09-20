"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown, CheckCircle, Cpu, Clock, ShieldCheck, Zap } from "lucide-react";

const STATS = [
  { value: "99.9%", label: "Pipeline Reliability", icon: ShieldCheck, desc: "Atomic S3 commit guarantee" },
  { value: "5 Rungs", label: "Multi-Bitrate HLS", icon: Zap, desc: "360p up to 1440p master playlist" },
  { value: "< 45s", label: "1080p Transcode Time", icon: Clock, desc: "Parallel segment encoding" },
  { value: "100%", label: "Idempotent Retries", icon: Cpu, desc: "Zero corrupt partial outputs" },
];

const FAQS = [
  {
    q: "How fast will my uploaded video be processed?",
    a: "Most 1080p and 4K videos complete transcoding in under a minute thanks to our parallel segment encoding engine.",
  },
  {
    q: "What video formats and resolutions can I upload?",
    a: "We support MP4, MOV, MKV, WebM, M4V, and MPEG video across resolutions from 360p up to 4K UHD.",
  },
  {
    q: "How does adaptive bitrate streaming work for my viewers?",
    a: "Your video is automatically prepared in a multi-resolution ladder (360p to 1440p). The player evaluates each viewer's internet connection and dynamically adjusts quality without buffering pauses.",
  },
  {
    q: "Can I embed processed videos into custom web or mobile apps?",
    a: "Yes! Transcode.io outputs standard adaptive HLS playlist URLs (.m3u8) compatible with custom web players, iOS, Android, and smart TVs.",
  },
  {
    q: "Where do I track video status and view developer API documentation?",
    a: "You can track video progress live on your dashboard or integrate directly via our REST API documented in the /docs section.",
  },
];

export function StatsAndFaq() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <section id="faq" className="py-16 md:py-24 bg-slate-50/70 dark:bg-[#070a12] border-t border-slate-200/80 dark:border-slate-800/60 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
        
        {/* Top Key Metrics Banner */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm text-center space-y-2 group hover:border-sky-500/50 transition-all"
              >
                <div className="h-10 w-10 mx-auto rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold font-mono text-slate-900 dark:text-white tracking-tight">
                  {stat.value}
                </div>
                <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  {stat.label}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-500">
                  {stat.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-300 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 text-xs font-mono font-semibold">
              <HelpCircle className="h-3.5 w-3.5 text-purple-500" />
              <span>Got Questions?</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4 font-sans">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={faq.q}
                  className={`rounded-2xl border transition-all duration-300 overflow-hidden shadow-xs ${
                    isOpen
                      ? "bg-white dark:bg-slate-900/90 border-purple-400 dark:border-purple-500/60 shadow-md ring-1 ring-purple-500/20"
                      : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
                  >
                    <span className="text-base font-semibold">{faq.q}</span>
                    <ChevronDown
                      className={`h-5 w-5 text-slate-400 transition-transform duration-300 shrink-0 ${
                        isOpen ? "rotate-180 text-purple-500" : ""
                      }`}
                    />
                  </button>

                  {/* Smooth Accordion Expansion Container */}
                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-5 pb-5 pt-1 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800/80 leading-relaxed">
                        <div className="flex items-start gap-2.5 pt-2">
                          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-1" />
                          <p>{faq.a}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
