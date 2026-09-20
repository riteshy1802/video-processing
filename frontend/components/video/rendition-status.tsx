import React from "react";
import { Rendition } from "@/types/video";
import { WorkerNodeBadge } from "@/components/processing/worker-node-badge";
import { cn } from "@/lib/utils";

interface RenditionStatusProps {
  renditions: Rendition[];
  className?: string;
}

function formatProcessingTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${remainingSeconds}s`;
}

export function RenditionStatusList({
  renditions,
  className,
}: RenditionStatusProps) {
  if (!renditions || renditions.length === 0) return null;

  const sortedRenditions = [...renditions].sort((a, b) => {
    const resA = parseInt(String(a.resolution).replace(/\D/g, ""), 10) || 0;
    const resB = parseInt(String(b.resolution).replace(/\D/g, ""), 10) || 0;
    return resA - resB;
  });

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}>
      {sortedRenditions.map((rendition) => {
        const isProcessing = rendition.status === "processing";
        const isReady = rendition.status === "ready";
        const isFailed = rendition.status === "failed";
        const isQueued = rendition.status === "queued";

        return (
          <div
            key={rendition.resolution}
            className={cn(
              "p-3.5 rounded-xl border transition-all font-sans text-xs shadow-xs space-y-2.5 flex flex-col justify-between",
              isProcessing && "bg-sky-50/50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/40 shadow-xs",
              isReady && "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100",
              isQueued && "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80 text-slate-500 dark:text-slate-400",
              isFailed && "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "w-12 h-7 rounded-md flex items-center justify-center font-sans font-semibold text-[11px]",
                    isReady && "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20",
                    isProcessing && "bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-400/30",
                    isQueued && "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700",
                    isFailed && "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-500/30"
                  )}
                >
                  {rendition.resolution}
                </div>
                <div>
                  <div className="font-sans font-semibold text-slate-900 dark:text-slate-100 text-sm">
                    {rendition.resolution === "1440p"
                      ? "1440p 2K QHD"
                      : rendition.resolution === "1080p"
                      ? "1080p Full HD"
                      : rendition.resolution === "720p"
                      ? "720p HD"
                      : rendition.resolution === "480p"
                      ? "480p SD"
                      : "360p SD"}
                  </div>
                </div>
              </div>

              <WorkerNodeBadge status={rendition.status} workerId={rendition.workerId} />
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <span>
                {isProcessing && "Kafka Consumer Task Active"}
                {isReady && (rendition.processingTime !== undefined && rendition.processingTime !== null ? `Completed in ${formatProcessingTime(rendition.processingTime)}` : "Ready for streaming")}
                {isQueued && "Waiting in Kafka Queue"}
                {isFailed && (rendition.error || "Transcode error")}
              </span>
              {rendition.workerId && (
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                  {rendition.workerId.replace("worker-", "Worker-")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
