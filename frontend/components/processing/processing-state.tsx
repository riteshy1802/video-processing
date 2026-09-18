"use client";

import { Video } from "@/types/video";
import { VideoProcessingState } from "@/lib/hooks/use-video-processing-events";
import { KafkaArchitectureDiagram } from "./kafka-architecture-diagram";
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

  // Calculate live readiness
  const renditions = processingState?.renditions?.length
    ? processingState.renditions
    : (video.renditions ?? []);
  const readyCount = renditions.filter((rendition) => {
    const status = (rendition.status || "").toUpperCase();
    return status === "READY";
  }).length;

  return (
    <div className="space-y-6 font-sans">
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

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-medium bg-slate-900/80 border-slate-800">
              <span className={cn("h-2 w-2 rounded-full shrink-0", isCompleted ? "bg-emerald-400" : isConnected ? "bg-emerald-400 animate-ping" : "bg-amber-400")} />
              <span className={isCompleted || isConnected ? "text-emerald-400" : "text-amber-400"}>
                {isCompleted ? "Pipeline Complete" : isConnected ? "Live SSE Connected" : "Connecting SSE..."}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-mono font-bold">
              {readyCount} / {renditions.length} Ready
            </div>
            {processingState && (
              <div className="px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-mono font-bold">
                {Math.round(processingState.overall_progress)}% Overall
              </div>
            )}
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
      <KafkaArchitectureDiagram video={video} processingState={processingState} />
    </div>
  );
}
