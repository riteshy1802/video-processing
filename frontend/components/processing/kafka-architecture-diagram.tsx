"use client";

import { useState } from "react";
import { Rendition, Video, ChunkProgressState } from "@/types/video";
import { RenditionState, VideoProcessingState } from "@/lib/hooks/use-video-processing-events";
import { WorkerNodeBadge } from "./worker-node-badge";
import {
  Layers,
  Server,
  ArrowDown,
  CheckCircle2,
  Boxes,
  FileCode,
  X,
  Cpu,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KafkaArchitectureDiagramProps {
  video: Video;
  processingState?: VideoProcessingState | null;
  selectedRenditionRes?: string | null;
  onSelectRendition?: (resolution: string) => void;
}

function workerBadgeStatus(status: string): Rendition["status"] {
  if (status === "processing" || status === "ready" || status === "failed") return status;
  return "queued";
}

export function RenditionDetails({
  rendition,
  resolution,
  onClose,
}: {
  rendition: RenditionState | null;
  resolution: string;
  onClose: () => void;
}) {
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);

  return (
    <aside className="flex h-full min-h-[28rem] flex-col rounded-xl border border-sky-500/30 bg-[#0b101d] p-4 font-mono text-xs shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-slate-100">{resolution} chunk details</h3>
          <p className="mt-1 text-[10px] text-slate-400">
            Overall {rendition?.progress ?? 0}% · {rendition?.completed_chunks ?? 0}/{rendition?.total_chunks ?? 0} complete
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-700 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          aria-label="Close rendition details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="my-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-[width] duration-300"
          style={{ width: `${rendition?.progress ?? 0}%` }}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {rendition?.chunks.length ? rendition.chunks.map((chunk: ChunkProgressState) => {
          const isDone = chunk.status === "DONE" || chunk.progress >= 100;
          const isProcessing = chunk.status === "PROCESSING";
          const isExpanded = expandedChunkId === chunk.chunk_id;
          const ffmpegEntries = chunk.ffmpeg
            ? [
                ["frame", chunk.ffmpeg.frame],
                ["fps", chunk.ffmpeg.fps],
                ["time", chunk.ffmpeg.time],
                ["speed", chunk.ffmpeg.speed],
                ["bitrate", chunk.ffmpeg.bitrate],
                ["duplicated", chunk.ffmpeg.dup_frames],
                ["dropped", chunk.ffmpeg.drop_frames],
              ].filter(([, value]) => value !== null && value !== undefined && value !== "")
            : [];

          return (
            <div
              key={chunk.chunk_id}
              className={cn(
                "overflow-hidden rounded-lg border",
                isDone && "border-emerald-500/30 bg-emerald-950/20",
                isProcessing && "border-sky-500/40 bg-sky-950/30",
                !isDone && !isProcessing && "border-slate-800 bg-slate-900/60"
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedChunkId(isExpanded ? null : chunk.chunk_id)}
                className="w-full space-y-2.5 p-3 text-left"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-100">Chunk {chunk.chunk_index}</span>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                    {chunk.progress}% · {chunk.status}
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")} />
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-300", isDone ? "bg-emerald-400" : "bg-sky-400")}
                    style={{ width: `${chunk.progress}%` }}
                  />
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3 text-[10px] text-slate-400">
                  <span className="min-w-0 truncate" title={chunk.chunk_id}>{chunk.chunk_id}</span>
                  <span className="max-w-[45%] shrink-0 truncate" title={chunk.worker_id || "Unassigned"}>
                    {chunk.worker_id || "Unassigned"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-2 border-t border-slate-800 px-3 py-2.5 text-[10px]">
                  {typeof chunk.start_seconds === "number" && typeof chunk.end_seconds === "number" && (
                    <div className="flex justify-between gap-3 text-slate-400">
                      <span>source range</span>
                      <span className="text-slate-200">{chunk.start_seconds}s → {chunk.end_seconds}s</span>
                    </div>
                  )}
                  {ffmpegEntries.length ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-black/30 p-2">
                      {ffmpegEntries.map(([label, value]) => (
                        <div key={String(label)} className="contents">
                          <span className="text-slate-500">{label}</span>
                          <span className="text-right text-emerald-300">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500">FFmpeg progress will appear when this chunk starts.</p>
                  )}
                  {chunk.message && <p className="text-sky-300">{chunk.message}</p>}
                  {chunk.error && <p className="text-rose-400">{chunk.error}</p>}
                </div>
              )}
            </div>
          );
        }) : (
          <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-slate-500">
            <Cpu className="mx-auto mb-2 h-5 w-5" />
            No chunks are registered for this rendition yet.
          </div>
        )}
      </div>
    </aside>
  );
}

export function KafkaArchitectureDiagram({
  video,
  processingState,
  selectedRenditionRes = null,
  onSelectRendition,
}: KafkaArchitectureDiagramProps) {

  // Merge live SSE renditions status with video.renditions
  const liveRenditionsMap = new Map<string, RenditionState>();
  if (processingState?.renditions) {
    processingState.renditions.forEach((r) => {
      const resKey = (r.resolution || "").endsWith("p") ? r.resolution : `${r.resolution}p`;
      liveRenditionsMap.set(resKey, r);
    });
  }

  // Fallback renditions list
  const renditions: Rendition[] = video.renditions?.length
    ? video.renditions
    : (processingState?.renditions ?? []).map((rendition) => ({
      resolution: rendition.resolution,
      status: rendition.status.toLowerCase() as Rendition["status"],
      workerId: rendition.workerId,
    }));

  const videoStatus = (processingState?.video_status || video.status || "").toLowerCase();
  
  // Calculate if all chunks across all renditions reached 100%
  const allChunksCompleted = (processingState?.total_chunks ?? 0) > 0 && 
    (processingState?.completed_chunks === processingState?.total_chunks || processingState?.overall_progress === 100);

  const isVideoFinalizing = videoStatus === "finalizing" || allChunksCompleted || videoStatus === "ready" || videoStatus === "completed";
  const isVideoReady = videoStatus === "ready" || videoStatus === "completed";
  const isVideoProcessing = videoStatus === "processing" || isVideoFinalizing;
  return (
    <div
      className="w-full bg-white dark:bg-[#070a12] border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-xs font-sans relative"
    >
      
      {/* Stage 1: Raw Video Upload / S3 Ingestion */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs shadow-xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="font-bold">Raw Video Upload (S3 Direct Ingestion)</span>
          <span className="text-emerald-600 dark:text-emerald-500">|</span>
          <span className="text-emerald-200 font-medium">{video.filename}</span>
        </div>

        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 2: Job Planner Phase */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className={cn(
          "w-full max-w-lg p-3.5 rounded-xl border font-mono text-xs flex items-center justify-between shadow-xs transition-colors",
          processingState?.planner_status === "COMPLETED" || isVideoProcessing
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            : "bg-slate-900/60 border-slate-800 text-slate-400"
        )}>
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Job Planner & Video Probing Phase</span>
          </div>
          <span className={cn(
            "text-[11px] font-mono px-2 py-0.5 rounded font-semibold",
            processingState?.planner_status === "COMPLETED" || isVideoProcessing ? "text-emerald-400 bg-emerald-500/20" : "text-slate-500 bg-slate-800"
          )}>
            {processingState?.planner_status === "COMPLETED" || isVideoProcessing ? "PLAN COMPLETE" : "PLANNING"}
          </span>
        </div>

        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 3: Kafka Transcoding Queue */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className={cn(
          "w-full max-w-lg p-3.5 rounded-xl border font-mono text-xs flex items-center justify-between shadow-xs transition-colors",
          isVideoProcessing ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-sky-500/10 border-sky-500/30 text-sky-300"
        )}>
          <div className="flex items-center gap-2 font-bold">
            <span className={cn("h-2 w-2 rounded-full shrink-0", isVideoProcessing ? "bg-emerald-400 animate-ping" : "bg-sky-400")} />
            <span>Kafka Transcoding Queue</span>
          </div>
          <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded font-semibold", isVideoProcessing ? "text-emerald-400 bg-emerald-500/20" : "text-sky-400 bg-sky-500/20")}>
            Topic: video.transcode.jobs
          </span>
        </div>

        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 4: Parallel Worker Consumers Grid (360p, 480p, 720p, 1080p, 1440p) */}
      <div>
        <div className="space-y-3">
          <div className="text-center font-mono text-[11px] text-slate-400 uppercase tracking-widest font-semibold flex items-center justify-center gap-2">
            <Boxes className="h-3.5 w-3.5 text-sky-400" />
            <span>Parallel Kafka Worker Consumer Pool</span>
          </div>

          <div className={cn(
              "grid gap-3",
              renditions.length === 5 ? "grid-cols-1 sm:grid-cols-3 lg:grid-cols-5" :
              renditions.length === 3 ? "grid-cols-1 sm:grid-cols-3" :
              renditions.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
              renditions.length === 1 ? "grid-cols-1 max-w-xs mx-auto" :
              "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            )}>
            {renditions.map((r) => {
            const resKey = (r.resolution || "").endsWith("p") ? r.resolution : `${r.resolution}p`;
            const liveRendition = liveRenditionsMap.get(resKey);
            const currentStatus = (liveRendition?.status || r.status || "pending").toLowerCase();
            const isProcessing = currentStatus === "processing";
            const isReady = currentStatus === "ready";
            const isQueued = currentStatus === "queued" || currentStatus === "pending";
            
            const totalChunks = liveRendition?.total_chunks || 1;
            const completedChunks = liveRendition?.completed_chunks ?? (isReady ? totalChunks : 0);
            
            const rawProgress = liveRendition?.progress ?? (isReady ? 100 : 0);
            const progress = Number.isFinite(rawProgress)
              ? Math.min(100, Math.max(0, rawProgress))
              : 0;
            const progressLabel = progress > 0 && progress < 1
              ? progress.toFixed(1)
              : Math.round(progress).toString();
            
            const activeWorkers = liveRendition?.chunks
              .filter((chunk) => chunk.worker_id)
              .map((chunk) => chunk.worker_id as string) ?? [];
            const workerId = activeWorkers[0] || liveRendition?.workerId || r.workerId;
            const workerName = workerId
              ? (activeWorkers.length > 1 ? `${activeWorkers.length} workers` : workerId)
              : "Unassigned";
            const isSelected = selectedRenditionRes === resKey;

            return (
              <div
                key={r.resolution}
                onClick={() => onSelectRendition?.(resKey)}
                className={cn(
                  "p-4 rounded-xl border transition-all font-mono text-xs flex flex-col justify-between space-y-3 shadow-sm relative overflow-hidden cursor-pointer hover:scale-[1.02] group",
                  isSelected && "ring-2 ring-sky-400 border-sky-400 shadow-sky-500/20",
                  isProcessing && !isSelected && "bg-slate-900/80 border-emerald-500/50 text-emerald-200 shadow-emerald-500/10",
                  isReady && !isSelected && "bg-emerald-950/40 border-emerald-500/40 text-emerald-100 shadow-md",
                  isQueued && !isSelected && "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                )}
              >
                <div className="flex items-center justify-between relative z-10">
                  <span className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                    {isReady && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                    {r.resolution}
                  </span>
                  <span
                    className="max-w-[55%] truncate rounded border border-slate-700/50 bg-slate-800/80 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400"
                    title={workerName}
                  >
                    {workerName}
                  </span>
                </div>

                <div className="pt-1 relative z-10 flex items-center justify-between">
                  <WorkerNodeBadge status={workerBadgeStatus(currentStatus)} workerId={workerId} />
                  <ChevronRight className="ml-5 h-4 w-4 text-slate-500 group-hover:text-sky-400 transition-colors shrink-0" />
                </div>

                <div className="relative z-10 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-300">
                    <span className="font-semibold">{progressLabel}% complete</span>
                    <span>{completedChunks}/{totalChunks} chunks</span>
                  </div>
                  <div
                    className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-700"
                    aria-label={`${resKey} progress`}
                  >
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out",
                        isReady ? "bg-emerald-400" : "bg-gradient-to-r from-sky-400 to-emerald-400"
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center text-center my-2">
        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 5: Finalizing Video Step */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className={cn(
          "w-full max-w-3xl gap-4 p-3.5 rounded-xl border font-mono text-xs flex items-center justify-between shadow-xs transition-all",
          isVideoReady
            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-bold"
            : isVideoFinalizing
            ? "bg-amber-500/10 border-amber-500/50 text-amber-300 font-bold shadow-amber-500/10"
            : "bg-slate-900/60 border-slate-800 text-slate-400"
        )}>
          <div className="flex min-w-0 items-center gap-2 text-left">
            {isVideoReady ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : isVideoFinalizing ? (
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping shrink-0" />
            ) : (
              <FileCode className="h-4 w-4 text-slate-500 shrink-0" />
            )}
            <span className="min-w-0">
              {isVideoReady
                ? "Finalized Video: Master Playlist Ready (master.m3u8)"
                : isVideoFinalizing
                ? "Assembling HLS segments & Generating master.m3u8"
                : "Finalizing Video: Assembling HLS Segments & Generating master.m3u8"}
            </span>
          </div>
          <span className={cn(
            "shrink-0 text-[10px] font-mono px-2 py-0.5 rounded font-semibold",
            isVideoReady
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : isVideoFinalizing
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse"
              : "bg-slate-800 text-slate-500"
          )}>
            {isVideoReady ? "MASTER READY" : isVideoFinalizing ? "100% · PROCESSING" : "WAITING"}
          </span>
        </div>
      </div>

      {/* Stage 6: HLS Packaging & CDN Output */}
      <div className="pt-4 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-sky-400 shrink-0" />
          <span className="font-semibold text-slate-200">HLS Master Playlist Output (master.m3u8)</span>
        </div>

        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-slate-200">S3 / CloudFront CDN Storage Ready</span>
        </div>
      </div>

    </div>
  );
}
