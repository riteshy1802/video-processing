"use client";

import { useState } from "react";
import Image from "next/image";
import { Cpu, FileCheck2, ShieldAlert, Layers, ExternalLink } from "lucide-react";

const ARCH_TABS = [
  {
    id: "distributed",
    title: "Distributed Pipeline",
    icon: Cpu,
    src: "/architecture/worker_distributed_processing.svg",
    desc: "Demonstrates how chunked video segments are dynamically distributed to independent Kafka worker nodes to encode renditions in parallel.",
  },
  {
    id: "atomic-writes",
    title: "Atomic S3 Writes",
    icon: FileCheck2,
    src: "/architecture/file_write_strategy_to_avoid_partial_corrupt_of_data.svg",
    desc: "Prevents data corruption by staging partial transcode fragments before executing atomic commit renames on object storage.",
  },
  {
    id: "idempotency",
    title: "Fault Tolerance",
    icon: ShieldAlert,
    src: "/architecture/idempotency_mechaism.svg",
    desc: "Ensures worker crashes during transcode execution can safely resume from byte offsets without duplicate segment writes.",
  },
  {
    id: "overview",
    title: "Full Architecture",
    icon: Layers,
    src: "/architecture/all.svg",
    desc: "Complete end-to-end VOD system architecture map: REST API, S3 Storage, Kafka Queue, Worker Pool & HLS segmenter.",
  },
];

export function ArchitectureSection() {
  const [activeTab, setActiveTab] = useState(ARCH_TABS[0].id);
  const currentTab = ARCH_TABS.find((t) => t.id === activeTab) || ARCH_TABS[0];

  return (
    <section id="architecture" className="py-16 md:py-24 bg-white dark:bg-[#090d16] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-mono font-semibold">
            <Cpu className="h-3.5 w-3.5 text-emerald-500" />
            <span>Production Architecture</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Engineered for Zero Data Loss & High Concurrency
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-400 font-normal">
            Explore the internal system design diagrams powering Transcode.io.
          </p>
        </div>

        {/* Tab Selection Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
          {ARCH_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                  isActive
                    ? "bg-slate-900 text-white dark:bg-sky-500/20 dark:text-sky-300 border-slate-900 dark:border-sky-500/40 shadow-md"
                    : "bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-sky-400" : "text-slate-400"}`} />
                <span>{tab.title}</span>
              </button>
            );
          })}
        </div>

        {/* Diagram Display Container */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 md:p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800 mb-6 font-mono text-xs">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{currentTab.title}</span>
              </h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-2xl font-sans text-xs">
                {currentTab.desc}
              </p>
            </div>

            <a
              href={currentTab.src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:text-sky-600 dark:hover:text-sky-400 transition-colors shrink-0"
            >
              <span>View Full SVG</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* SVG Diagram Canvas */}
          <div className="relative w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 min-h-[350px] md:min-h-[480px] flex items-center justify-center overflow-auto shadow-inner">
            <Image
              src={currentTab.src}
              alt={currentTab.title}
              width={1100}
              height={600}
              className="object-contain max-h-[550px] w-auto transition-all duration-300 filter dark:brightness-95"
              unoptimized
            />
          </div>
        </div>

      </div>
    </section>
  );
}
