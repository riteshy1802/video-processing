"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Video } from "@/types/video";
import { VideoProcessingState } from "@/lib/hooks/use-video-processing-events";
import { KafkaArchitectureDiagram, RenditionDetails } from "./kafka-architecture-diagram";
import {
  Activity,
  XCircle,
  Sparkles,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessingStateProps {
  video: Video;
  processingState?: VideoProcessingState | null;
  isConnected?: boolean;
  isCompleted?: boolean;
  countdown?: number | null;
  onForcePlay?: () => void;
}

export function ProcessingState({
  video,
  processingState,
  isConnected = false,
  isCompleted = false,
  countdown = null,
  onForcePlay,
}: ProcessingStateProps) {
  const [selectedRenditionRes, setSelectedRenditionRes] = useState<string | null>(null);
  const [detailsPortalTarget, setDetailsPortalTarget] = useState<HTMLElement | null>(null);
  const videoStatus = (processingState?.video_status || video.status || "").toUpperCase();
  const isCancelling = videoStatus === "CANCELLING";
  const isCancelled = videoStatus === "CANCELLED";
  const isFailing = videoStatus === "FAILING";

  // Calculate live readiness & chunk counts
  const renditions = processingState?.renditions?.length
    ? processingState.renditions
    : (video.renditions ?? []);

  const readyCount = renditions.filter((rendition) => {
    const status = (rendition.status || "").toUpperCase();
    return status === "READY";
  }).length;

  const totalChunks = processingState?.total_chunks ?? renditions.reduce(
    (acc, rendition) => acc + ("total_chunks" in rendition ? rendition.total_chunks : 1),
    0
  );
  const completedChunks = processingState?.completed_chunks ?? readyCount;
  const overallProgress = processingState?.overall_progress ?? (renditions.length ? Math.round((readyCount / renditions.length) * 100) : 0);
  const selectedRendition = selectedRenditionRes
    ? processingState?.renditions.find((rendition) => {
        const resolution = (rendition.resolution || "").endsWith("p")
          ? rendition.resolution
          : `${rendition.resolution}p`;
        return resolution === selectedRenditionRes;
      }) ?? null
    : null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDetailsPortalTarget(document.getElementById("rendition-details-panel-slot"));
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRenditionRes(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="font-sans">
      <div className="min-w-0 space-y-6">
      {/* Real-time Processing Header Banner */}
      <div className={cn(
        "space-y-4 rounded-2xl border p-6 shadow-sm dark:shadow-lg",
        isCancelling || isCancelled || isFailing
          ? isCancelled || isFailing
            ? "border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-950/20"
            : "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"
          : "border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-emerald-50 dark:border-sky-500/20 dark:from-sky-950/40 dark:via-slate-900/60 dark:to-slate-950/40"
      )}>
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-center dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-sky-300 bg-sky-100 p-2.5 text-sky-600 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400">
              {isCancelled || isFailing ? <XCircle className="h-5 w-5 text-rose-500" /> : <Activity className={cn("h-5 w-5", !isCancelling && "animate-pulse")} />}
            </div>
            <div>
              <h2 className="flex items-center gap-2 font-sans text-base font-semibold text-slate-900 dark:text-slate-100">
                <span>{isCancelled ? "Video processing stopped" : isFailing ? "Stopping after processing failure..." : isCancelling ? "Stopping video processing..." : "Distributed HLS Transcoding Pipeline"}</span>
              </h2>
              <p className="mt-0.5 font-sans text-xs text-slate-600 dark:text-slate-400">
                {isCancelled
                  ? "Unfinished chunks and renditions were cancelled"
                  : isFailing
                    ? processingState?.error || "Active workers are stopping after a terminal failure"
                  : isCancelling
                    ? "Active workers are terminating their FFmpeg processes"
                    : "Real-time Kafka chunk partition progress via Redis Pub/Sub SSE"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap font-sans text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium shadow-xs dark:border-slate-800 dark:bg-slate-900/80">
              <span className={cn("h-2 w-2 rounded-full shrink-0", isCompleted ? "bg-emerald-500" : isCancelled || isFailing ? "bg-rose-500" : isConnected ? "bg-emerald-500 animate-ping" : "bg-amber-500")} />
              <span className={isCompleted || isConnected ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                {isCompleted ? "Pipeline Complete" : isCancelled ? "Processing Stopped" : isFailing ? "Failure shutdown" : isConnected ? "Live SSE Connected" : "Connecting SSE..."}
              </span>
            </div>

            <div className={cn(
              "rounded-lg border px-3 py-1.5 font-medium",
              isCancelled
                ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
            )}>
              {isCancelled ? "Processing Cancelled" : `${readyCount} / ${renditions.length} Renditions Ready`}
            </div>

            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              {isCancelled
                ? `${completedChunks} / ${totalChunks} chunks completed`
                : isFailing
                  ? "Terminal failure · stopping workers"
                : `Total Chunks: ${completedChunks} / ${totalChunks} (${Math.round(overallProgress)}%)`}
            </div>
          </div>
        </div>

        {/* Overall Progress Bar */}
        {!isCancelled && !isFailing && <div className="space-y-1.5">
          <div className="flex justify-between font-sans text-xs text-slate-600 dark:text-slate-400">
            <span className="font-medium">Overall Chunks Transcoded Progress</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{Math.round(overallProgress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-500 dark:bg-sky-400 transition-all duration-500 relative overflow-hidden"
              style={{ width: `${Math.max(0, Math.min(100, overallProgress))}%` }}
            >
              {!isCompleted && !isCancelled && (
                <div className="absolute inset-0 bg-white/20 animate-shimmer" style={{ backgroundSize: "200% 100%" }} />
              )}
            </div>
          </div>
        </div>}
      </div>

      {/* Completion Countdown Banner */}
      {countdown !== null && (
        <div className="animate-fade-in flex flex-col items-center justify-between gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-800 shadow-xl sm:flex-row dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shrink-0">
              <Sparkles className="h-6 w-6 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-mono text-sm font-bold text-emerald-900 dark:text-emerald-100">
                <span>Transcoding Complete! Preparing HLS Player...</span>
              </h3>
              <p className="mt-0.5 font-sans text-xs text-emerald-700 dark:text-emerald-300/80">
                All renditions ready. Redirecting to player in <span className="font-bold text-emerald-400 font-mono text-sm">{countdown}s</span>...
              </p>
            </div>
          </div>

          {onForcePlay && (
            <button
              onClick={onForcePlay}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-emerald-500/20 shrink-0"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Play Video Now</span>
            </button>
          )}
        </div>
      )}

      {/* Kafka Parallel Transcode Architecture Flow Diagram */}
      <KafkaArchitectureDiagram
        video={video}
        processingState={processingState}
        selectedRenditionRes={selectedRenditionRes}
        onSelectRendition={setSelectedRenditionRes}
      />
      </div>

      {selectedRenditionRes && detailsPortalTarget && createPortal(
        <div className="h-[36rem] overflow-hidden">
          <RenditionDetails
            rendition={selectedRendition}
            resolution={selectedRenditionRes}
            onClose={() => setSelectedRenditionRes(null)}
          />
        </div>,
        detailsPortalTarget
      )}
    </div>
  );
}
