"use client";

import { useEffect, useState } from "react";
import { Video } from "@/types/video";
import { VideoProcessingState } from "@/lib/hooks/use-video-processing-events";
import { KafkaArchitectureDiagram, RenditionDetails } from "./kafka-architecture-diagram";
import {
  Activity,
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRenditionRes(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={cn(
      "items-start font-sans",
      selectedRenditionRes && "min-[1800px]:relative min-[1800px]:left-1/2 min-[1800px]:grid min-[1800px]:w-[calc(100%+28rem)] min-[1800px]:-translate-x-1/2 min-[1800px]:grid-cols-[minmax(0,1fr)_26rem] min-[1800px]:gap-8"
    )}>
      <div className="min-w-0 space-y-6">
      {/* Real-time Processing Header Banner */}
      <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-r from-sky-950/40 via-slate-900/60 to-slate-950/40 p-6 shadow-lg backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
                <span>Distributed HLS Transcoding Pipeline</span>
              </h2>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Real-time Kafka chunk partition progress via Redis Pub/Sub SSE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-medium bg-slate-900/80 border-slate-800">
              <span className={cn("h-2 w-2 rounded-full shrink-0", isCompleted ? "bg-emerald-400" : isConnected ? "bg-emerald-400 animate-ping" : "bg-amber-400")} />
              <span className={isCompleted || isConnected ? "text-emerald-400" : "text-amber-400"}>
                {isCompleted ? "Pipeline Complete" : isConnected ? "Live SSE Connected" : "Connecting SSE..."}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-mono font-bold">
              {readyCount} / {renditions.length} Renditions Ready
            </div>

            <div className="px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-mono font-bold">
              Total Chunks: {completedChunks} / {totalChunks} ({Math.round(overallProgress)}%)
            </div>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>Overall Chunks Transcoded Progress</span>
            <span className="text-emerald-400 font-bold">{Math.round(overallProgress)}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-800/80 overflow-hidden p-0.5 border border-slate-700/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-teal-400 to-emerald-400 transition-all duration-500 relative overflow-hidden"
              style={{ width: `${Math.max(0, Math.min(100, overallProgress))}%` }}
            >
              {!isCompleted && (
                <div className="absolute inset-0 bg-white/20 animate-shimmer" style={{ backgroundSize: "200% 100%" }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Completion Countdown Banner */}
      {countdown !== null && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl text-emerald-200 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shrink-0">
              <Sparkles className="h-6 w-6 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <div>
              <h3 className="font-mono text-sm font-bold text-emerald-100 flex items-center gap-2">
                <span>Transcoding Complete! Preparing HLS Player...</span>
              </h3>
              <p className="text-xs text-emerald-300/80 mt-0.5 font-sans">
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

      {selectedRenditionRes && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-hidden bg-[#070a12] p-4 shadow-2xl min-[1800px]:sticky min-[1800px]:top-4 min-[1800px]:col-start-2 min-[1800px]:row-start-1 min-[1800px]:z-auto min-[1800px]:h-[min(44rem,calc(100vh-2rem))] min-[1800px]:w-auto min-[1800px]:max-w-none min-[1800px]:bg-transparent min-[1800px]:p-0 min-[1800px]:shadow-none">
          <RenditionDetails
            rendition={selectedRendition}
            resolution={selectedRenditionRes}
            onClose={() => setSelectedRenditionRes(null)}
          />
        </div>
      )}
    </div>
  );
}
