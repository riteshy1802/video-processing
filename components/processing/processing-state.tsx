"use client";

import { Video } from "@/types/video";
import { KafkaArchitectureDiagram } from "./kafka-architecture-diagram";
import { RenditionStatusList } from "@/components/video/rendition-status";
import { Cpu } from "lucide-react";

interface ProcessingStateProps {
  video: Video;
}

export function ProcessingState({ video }: ProcessingStateProps) {
  return (
    <div className="space-y-6">
      {/* Kafka Parallel Transcode Architecture Diagram */}
      <KafkaArchitectureDiagram video={video} />

      {/* Renditions Breakdown Panel */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#111726] p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/60 pb-4">
          <div>
            <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>Kafka Consumer Worker Allocation</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
              Parallel worker consumers process independent rendition jobs (144p, 480p, 720p, 1080p) from Kafka topic queues.
            </p>
          </div>
          <div className="font-mono text-xs text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 px-3 py-1 rounded-lg flex items-center gap-2 font-semibold shrink-0">
            <span className="h-2 w-2 rounded-full bg-sky-500 animate-ping shrink-0" />
            <span>Active Worker Pool</span>
          </div>
        </div>

        <RenditionStatusList renditions={video.renditions} />
      </div>
    </div>
  );
}
