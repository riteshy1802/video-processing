"use client";

import { Video } from "@/types/video";
import { WorkerNodeBadge } from "./worker-node-badge";
import { Film, HardDrive, Cpu, Layers, Server, ArrowDown, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface KafkaArchitectureDiagramProps {
  video: Video;
}

export function KafkaArchitectureDiagram({ video }: KafkaArchitectureDiagramProps) {
  const renditions = video.renditions || [];

  return (
    <div className="w-full bg-white dark:bg-[#070a12] border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-xs">
      {/* Stage 1: Raw Video Upload / S3 Ingestion */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100 shadow-xs">
          <HardDrive className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="font-bold">Raw Video Upload (S3 Direct Ingestion)</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500 font-medium">{video.filename}</span>
        </div>

        <ArrowDown className="h-4 w-4 text-slate-400 dark:text-slate-600 animate-bounce my-1" />
      </div>

      {/* Stage 2: Kafka Transcoding Queue */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="w-full max-w-lg p-3.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 text-sky-900 dark:text-sky-200 font-mono text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 font-bold">
            <span className="h-2 w-2 rounded-full bg-sky-500 animate-ping shrink-0" />
            <span>Kafka Transcoding Queue</span>
          </div>
          <span className="text-[11px] font-mono text-sky-700 dark:text-sky-400 bg-sky-100 dark:bg-sky-500/20 px-2 py-0.5 rounded font-semibold">
            Topic: video.transcode.jobs
          </span>
        </div>

        <ArrowDown className="h-4 w-4 text-sky-500/60 dark:text-sky-400/60 my-1" />
      </div>

      {/* Stage 3: Parallel Worker Consumers Grid (144p, 480p, 720p, 1080p) */}
      <div className="space-y-2">
        <div className="text-center font-mono text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold">
          Parallel Kafka Worker Consumer Pool
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {renditions.map((r, idx) => {
            const isProcessing = r.status === "processing";
            const isReady = r.status === "ready";
            const isQueued = r.status === "queued";
            const defaultWorker = `Worker-0${idx + 1}`;
            const workerName = r.workerId ? r.workerId.replace("worker-", "Worker-") : defaultWorker;

            return (
              <div
                key={r.resolution}
                className={cn(
                  "p-3.5 rounded-xl border transition-all font-mono text-xs flex flex-col justify-between space-y-3 shadow-xs",
                  isProcessing && "bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/40 animate-transcode shadow-sm",
                  isReady && "bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100",
                  isQueued && "bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-500"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {r.resolution}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    {workerName}
                  </span>
                </div>

                <div className="pt-1">
                  <WorkerNodeBadge status={r.status} workerId={r.workerId || `worker-0${idx + 1}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage 4: HLS Packaging & CDN Output */}
      <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">HLS Master Playlist Output (.m3u8)</span>
        </div>

        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">S3 / CloudFront CDN Storage</span>
        </div>
      </div>
    </div>
  );
}
