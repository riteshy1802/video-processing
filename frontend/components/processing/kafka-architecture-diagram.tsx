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
    <aside className="flex h-full min-h-[28rem] flex-col rounded-xl border border-sky-200 bg-white p-4 font-mono text-xs shadow-xl dark:border-sky-500/30 dark:bg-[#0b101d]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100">{resolution} chunk details</h3>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Overall {rendition?.progress ?? 0}% · {rendition?.completed_chunks ?? 0}/{rendition?.total_chunks ?? 0} complete
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label="Close rendition details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="my-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
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
              ].filter(([, value]) => value !== null && value !== undefined && value !== "")
            : [];

          return (
            <div
              key={chunk.chunk_id}
              className={cn(
                "overflow-hidden rounded-lg border",
                isDone && "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/20",
                isProcessing && "border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-950/30",
                !isDone && !isProcessing && "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60"
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedChunkId(isExpanded ? null : chunk.chunk_id)}
                className="w-full space-y-2.5 p-3 text-left"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100">Chunk {chunk.chunk_index}</span>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    {chunk.progress}% · {chunk.status}
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")} />
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-300", isDone ? "bg-emerald-400" : "bg-sky-400")}
                    style={{ width: `${chunk.progress}%` }}
                  />
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="min-w-0 truncate" title={chunk.chunk_id}>{chunk.chunk_id}</span>
                  <span className="max-w-[45%] shrink-0 truncate text-slate-500 dark:text-slate-400 font-semibold" title={chunk.worker_id || "Queued"}>
                    {chunk.worker_id || "Queued"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-2 border-t border-slate-200 px-3 py-2.5 text-[10px] dark:border-slate-800">
                  {typeof chunk.start_seconds === "number" && typeof chunk.end_seconds === "number" && (
                    <div className="flex justify-between gap-3 text-slate-500 dark:text-slate-400">
                      <span>source range</span>
                      <span className="text-slate-700 dark:text-slate-200">{chunk.start_seconds}s → {chunk.end_seconds}s</span>
                    </div>
                  )}
                  {ffmpegEntries.length ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-slate-100 p-2 dark:bg-black/30">
                      {ffmpegEntries.map(([label, value]) => (
                        <div key={String(label)} className="contents">
                          <span className="text-slate-500">{label}</span>
                          <span className="text-right text-emerald-700 dark:text-emerald-300">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500">FFmpeg progress will appear when this chunk starts.</p>
                  )}
                  {chunk.message && <p className="text-sky-700 dark:text-sky-300">{chunk.message}</p>}
                  {chunk.error && <p className="text-rose-600 dark:text-rose-400">{chunk.error}</p>}
                </div>
              )}
            </div>
          );
        }) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-800">
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

  // Fallback renditions list sorted from lowest to highest resolution
  const rawRenditions: Rendition[] = video.renditions?.length
    ? video.renditions
    : (processingState?.renditions ?? []).map((rendition) => ({
      resolution: rendition.resolution,
      status: rendition.status.toLowerCase() as Rendition["status"],
      workerId: rendition.workerId,
    }));

  const renditions: Rendition[] = [...rawRenditions].sort((a, b) => {
    const resA = parseInt(String(a.resolution).replace(/\D/g, ""), 10) || 0;
    const resB = parseInt(String(b.resolution).replace(/\D/g, ""), 10) || 0;
    return resA - resB;
  });

  const videoStatus = (processingState?.video_status || video.status || "").toLowerCase();

  // Calculate if all renditions are ready
  const allRenditionsReady = renditions.length > 0 && renditions.every((r) => {
    const resKey = (r.resolution || "").endsWith("p") ? r.resolution : `${r.resolution}p`;
    const liveRendition = liveRenditionsMap.get(resKey);
    const chunks = liveRendition?.chunks || [];
    const completedChunks = chunks.filter((c) => {
      const s = (c.status || "").toUpperCase();
      return s === "DONE" || s === "COMPLETED" || s === "READY" || c.progress >= 100;
    }).length;
    const rawRenditionStatus = (liveRendition?.status || r.status || "").toUpperCase();
    return rawRenditionStatus === "READY" || rawRenditionStatus === "COMPLETED" || (chunks.length > 0 && completedChunks === chunks.length);
  });

  const isVideoStatusReady = videoStatus === "ready" || videoStatus === "completed";
  const isVideoFinalizing = videoStatus === "finalizing" || allRenditionsReady || isVideoStatusReady;
  const isVideoReady = isVideoStatusReady;
  const isVideoProcessing = videoStatus === "processing" || isVideoFinalizing;
  const isKafkaQueueCompleted = isVideoReady || allRenditionsReady;
  return (
    <div
      className="w-full bg-white dark:bg-[#070a12] border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-xs font-sans relative"
    >
      
      {/* Stage 1: Raw Video Upload / S3 Ingestion */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 font-mono text-xs text-emerald-700 shadow-xs dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md border border-emerald-300 bg-slate-100 dark:border-emerald-500/30 dark:bg-slate-950/70">
            {video.thumbnailUrl ? (
              <div
                role="img"
                aria-label={`Thumbnail for ${video.filename}`}
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${JSON.stringify(video.thumbnailUrl).slice(1, -1)})` }}
              />
            ) : (
              <FileCode className="absolute inset-0 m-auto h-4 w-4 text-emerald-500/50" />
            )}
          </div>
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="font-bold">Raw Video Upload (S3 Direct Ingestion)</span>
          <span className="text-emerald-600 dark:text-emerald-500">|</span>
          <span className="font-medium text-emerald-800 dark:text-emerald-200">{video.filename}</span>
        </div>

        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 2: Job Planner Phase */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className={cn(
          "w-full max-w-lg p-3.5 rounded-xl border font-mono text-xs flex items-center justify-between shadow-xs transition-colors",
          processingState?.planner_status === "COMPLETED" || isVideoProcessing
            ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
            : "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-400"
        )}>
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Job Planner & Video Probing Phase</span>
          </div>
          <span className={cn(
            "text-[11px] font-mono px-2 py-0.5 rounded font-semibold",
            processingState?.planner_status === "COMPLETED" || isVideoProcessing ? "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/20" : "text-slate-600 bg-slate-200 dark:text-slate-500 dark:bg-slate-800"
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
          isKafkaQueueCompleted
            ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
            : isVideoProcessing
            ? "bg-amber-50 border-amber-300 text-amber-800 shadow-amber-500/10 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300"
            : "bg-sky-50 border-sky-300 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-300"
        )}>
          <div className="flex items-center gap-2 font-bold">
            <span className={cn(
              "h-2 w-2 rounded-full shrink-0",
              isKafkaQueueCompleted ? "bg-emerald-400" : isVideoProcessing ? "bg-amber-400 animate-ping" : "bg-sky-400"
            )} />
            <span>Kafka Transcoding Queue</span>
          </div>
          <span className={cn(
            "text-[11px] font-mono px-2 py-0.5 rounded font-semibold",
            isKafkaQueueCompleted
              ? "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/20"
              : isVideoProcessing
              ? "text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/20"
              : "text-sky-700 bg-sky-100 dark:text-sky-400 dark:bg-sky-500/20"
          )}>
            Topic: video.transcode.jobs
          </span>
        </div>

        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 4: Parallel Worker Consumers Grid (360p, 480p, 720p, 1080p, 1440p) */}
      <div>
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-center font-mono text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
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
            const chunks = liveRendition?.chunks || [];

            // 1. WORKER DISPLAY ALGORITHM: Derive active processing chunk tasks where status === "PROCESSING"
            const activeProcessingChunks = chunks.filter(
              (chunk) => (chunk.status || "").toUpperCase() === "PROCESSING" && chunk.worker_id
            );
            const fallbackWorkerId = liveRendition?.workerId || r.workerId;
            const isSyntheticFallback = typeof fallbackWorkerId === "string" && /^worker-\d+p?$/i.test(fallbackWorkerId);
            const validFallbackWorker = fallbackWorkerId && !isSyntheticFallback ? fallbackWorkerId : undefined;
            const activeWorkersCount = activeProcessingChunks.length > 0 
              ? activeProcessingChunks.length 
              : (validFallbackWorker ? 1 : 0);

            // 2. CHUNK STATUS AGGREGATION
            const totalChunks = Math.max(liveRendition?.total_chunks || 0, chunks.length, 1);
            const completedChunks = chunks.filter((chunk) => {
              const s = (chunk.status || "").toUpperCase();
              return s === "DONE" || s === "COMPLETED" || s === "READY" || chunk.progress >= 100;
            }).length;

            const hasCompletedChunks = completedChunks > 0;
            const allChunksDone = chunks.length > 0 && completedChunks === chunks.length;
            const rawRenditionStatus = (liveRendition?.status || r.status || "").toUpperCase();
            const isRenditionReady = rawRenditionStatus === "READY" || rawRenditionStatus === "COMPLETED";
            
            // Priority check: If ALL chunks for a rendition are DONE, mark rendition as Ready immediately!
            const isRenditionDone = isRenditionReady || allChunksDone;

            const anyChunkProcessing = activeWorkersCount > 0 || chunks.some((c) => (c.status || "").toUpperCase() === "PROCESSING");
            const allChunksPending = chunks.length > 0 && chunks.every((c) => {
              const s = (c.status || "").toUpperCase();
              return s === "PENDING" || s === "QUEUED";
            });

            // 3. RENDITION STATUS ALGORITHM
            let derivedStatusLabel: "ready" | "processing" | "queued" = "queued";
            if (isRenditionDone) {
              derivedStatusLabel = "ready";
            } else if (anyChunkProcessing || hasCompletedChunks) {
              derivedStatusLabel = "processing";
            } else {
              derivedStatusLabel = "queued";
            }

            // 4. WORKER DISPLAY TEXT (Top-right pill)
            let workerDisplayName = "No workers";
            if (isRenditionDone) {
              workerDisplayName = "No workers";
            } else if (activeWorkersCount === 0) {
              if (hasCompletedChunks && !allChunksDone) {
                workerDisplayName = "Waiting for worker";
              } else {
                workerDisplayName = "No workers";
              }
            } else if (activeWorkersCount === 1) {
              workerDisplayName = activeProcessingChunks[0]?.worker_id || validFallbackWorker || "1 worker";
            } else {
              workerDisplayName = `${activeWorkersCount} workers`;
            }

            // 5. PROGRESS CALCULATION
            let rawProgress = 0;
            if (isRenditionDone) {
              rawProgress = 100;
            } else if (chunks.length > 0) {
              const sumProgress = chunks.reduce((sum, chunk) => sum + Math.max(0, Math.min(100, chunk.progress ?? 0)), 0);
              rawProgress = sumProgress / chunks.length;
            } else {
              rawProgress = liveRendition?.progress ?? 0;
            }
            const progress = Math.min(100, Math.max(0, rawProgress));
            const progressLabel = progress > 0 && progress < 1
              ? progress.toFixed(1)
              : Math.round(progress).toString();

            const isSelected = selectedRenditionRes === resKey;
            const isReady = derivedStatusLabel === "ready";
            const isProcessing = derivedStatusLabel === "processing";
            const isQueued = derivedStatusLabel === "queued";
            const displayCompletedChunks = isReady ? totalChunks : completedChunks;

            return (
              <div
                key={r.resolution}
                onClick={() => onSelectRendition?.(resKey)}
                className={cn(
                  "p-4 rounded-xl border transition-all font-mono text-xs flex flex-col justify-between space-y-3 shadow-sm relative overflow-hidden cursor-pointer hover:scale-[1.02] group",
                  isSelected && "ring-2 ring-sky-400 border-sky-400 shadow-sky-500/20",
                  isProcessing && !isSelected && "bg-sky-50 border-emerald-400 text-emerald-800 shadow-emerald-500/10 dark:bg-slate-900/80 dark:border-emerald-500/50 dark:text-emerald-200",
                  isReady && !isSelected && "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-md dark:bg-emerald-950/40 dark:border-emerald-500/40 dark:text-emerald-100",
                  isQueued && !isSelected && "bg-white border-slate-300 text-slate-600 hover:border-slate-400 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700"
                )}
              >
                <div className="flex items-center justify-between relative z-10">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {isReady && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                    {r.resolution}
                  </span>
                  <span
                    className={cn(
                      "max-w-[55%] truncate rounded border px-1.5 py-0.5 text-[9px] font-semibold",
                      activeWorkersCount > 0 && !isRenditionDone
                        ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                        : workerDisplayName === "Waiting for worker" && !isRenditionDone
                        ? "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
                        : "border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                    )}
                    title={workerDisplayName}
                  >
                    {workerDisplayName}
                  </span>
                </div>

                <div className="pt-1 relative z-10 flex items-center justify-start">
                  <WorkerNodeBadge status={derivedStatusLabel} workerDisplay={workerDisplayName} className="max-w-full" />
                </div>

                <div className="relative z-10 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{progressLabel}% complete</span>
                    <span>{displayCompletedChunks}/{totalChunks} chunks</span>
                  </div>
                  <div
                    className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
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
            ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-bold dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-300"
            : isVideoFinalizing
            ? "bg-amber-50 border-amber-300 text-amber-700 font-bold shadow-amber-500/10 dark:bg-amber-500/10 dark:border-amber-500/50 dark:text-amber-300"
            : "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-400"
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
              : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-500"
          )}>
            {isVideoReady ? "MASTER READY" : isVideoFinalizing ? "PROCESSING" : "WAITING"}
          </span>
        </div>
      </div>

      {/* Stage 6: HLS Packaging & CDN Output */}
      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-4 font-mono text-xs text-slate-500 sm:flex-row dark:border-slate-800/60 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-sky-400 shrink-0" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">HLS Master Playlist Output (master.m3u8)</span>
        </div>

        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">S3 / CloudFront CDN Storage Ready</span>
        </div>
      </div>

    </div>
  );
}
