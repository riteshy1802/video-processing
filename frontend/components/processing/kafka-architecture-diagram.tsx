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
  Clock3,
  ChevronRight,
  Ban,
  ServerOff,
  XCircle,
  Database,
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
  const isRenditionCancelled = rendition?.status === "CANCELLED";

  return (
    <aside className="flex h-full min-h-[28rem] flex-col rounded-xl border border-slate-200 bg-white p-4 font-sans text-xs shadow-lg dark:border-slate-800 dark:bg-[#0b101d]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{resolution} Chunk Details</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-sans">
            {isRenditionCancelled
              ? `${rendition?.completed_chunks ?? 0}/${rendition?.total_chunks ?? 0} completed • Cancelled`
              : Math.round(rendition?.progress ?? 0) === 99 || ((rendition?.progress ?? 0) >= 99 && (rendition?.progress ?? 0) < 100 && rendition?.status !== "READY")
              ? `Uploading to S3 · ${rendition?.completed_chunks ?? 0}/${rendition?.total_chunks ?? 0} complete`
              : `Overall ${rendition?.progress ?? 0}% · ${rendition?.completed_chunks ?? 0}/${rendition?.total_chunks ?? 0} complete`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          aria-label="Close rendition details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!isRenditionCancelled && <div className="my-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", (rendition?.progress ?? 0) >= 99 || rendition?.status === "READY" ? "bg-emerald-500 dark:bg-emerald-400" : "bg-sky-500 dark:bg-sky-400")}
          style={{ width: `${rendition?.progress ?? 0}%` }}
        />
      </div>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {rendition?.chunks.length ? rendition.chunks.map((chunk: ChunkProgressState) => {
          const isDone = chunk.status === "DONE";
          const isProcessing = chunk.status === "PROCESSING";
          const isRetrying = chunk.status === "RETRYING";
          const isCancelled = chunk.status === "CANCELLED";
          const isChunkUploadingToS3 = !isDone && !isCancelled && (chunk.progress >= 99 && chunk.progress < 100);
          const isExpanded = expandedChunkId === chunk.chunk_id;
          const retryLabel = chunk.message || "Scheduled for retry";

          return (
            <div
              key={chunk.chunk_id}
              className={cn(
                "overflow-hidden rounded-lg border transition-colors",
                isDone && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-950/20",
                isChunkUploadingToS3 && "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-950/30",
                isProcessing && !isChunkUploadingToS3 && "border-sky-200 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-950/30",
                isRetrying && "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-950/20",
                isCancelled && "border-rose-200 bg-rose-50/60 dark:border-rose-500/20 dark:bg-rose-950/20",
                !isDone && !isProcessing && !isRetrying && !isCancelled && !isChunkUploadingToS3 && "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60"
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedChunkId(isExpanded ? null : chunk.chunk_id)}
                className="w-full space-y-2 p-2.5 text-left cursor-pointer"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100 text-xs">
                    {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    {isCancelled && <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                    Chunk {chunk.chunk_index}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 font-sans">
                    {isRetrying
                      ? `${retryLabel.startsWith("Recovering") ? "Recovering" : "Retrying"}${chunk.attempt ? ` · Attempt ${chunk.attempt}` : ""}`
                      : isChunkUploadingToS3
                      ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold"><Database className="h-3 w-3 text-emerald-500 animate-pulse" /> Uploading to S3</span>
                      : `${chunk.progress}% · ${chunk.status}`}
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform text-slate-400", isExpanded && "rotate-90")} />
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-300", isDone ? "bg-emerald-500" : isCancelled ? "bg-rose-500" : isRetrying ? "bg-amber-500" : "bg-sky-500")}
                    style={{ width: `${chunk.progress}%` }}
                  />
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <span className="min-w-0 truncate" title={chunk.chunk_id}>{chunk.chunk_id}</span>
                  <span className="max-w-[50%] shrink-0 truncate text-slate-600 dark:text-slate-300 font-medium" title={chunk.worker_id || (isRetrying ? retryLabel : "Queued")}>
                    {chunk.worker_id || (isRetrying ? retryLabel : "Queued")}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-1.5 border-t border-slate-200 px-3 py-2 text-[11px] dark:border-slate-800 font-sans">
                  {typeof chunk.start_seconds === "number" && typeof chunk.end_seconds === "number" && (
                    <div className="flex justify-between gap-3 text-slate-500 dark:text-slate-400 font-mono">
                      <span>source range</span>
                      <span className="text-slate-700 dark:text-slate-200">{chunk.start_seconds}s → {chunk.end_seconds}s</span>
                    </div>
                  )}
                  <p className="text-slate-500">Durable chunk status: <span className="font-mono text-slate-700 dark:text-slate-300">{isRetrying ? "PENDING" : chunk.status}</span></p>
                  {chunk.message && <p className="text-sky-700 dark:text-sky-300">{chunk.message}</p>}
                  {chunk.error && <p className="text-rose-600 dark:text-rose-400 font-mono">{chunk.error}</p>}
                </div>
              )}
            </div>
          );
        }) : (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-500 dark:border-slate-800 font-sans">
            <Cpu className="mx-auto mb-2 h-5 w-5 text-slate-400" />
            No chunks registered for this rendition yet.
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
  const isVideoCancelling = videoStatus === "cancelling";
  const isVideoCancelled = videoStatus === "cancelled";

  // Calculate if all renditions are ready
  const allRenditionsReady = renditions.length > 0 && renditions.every((r) => {
    const resKey = (r.resolution || "").endsWith("p") ? r.resolution : `${r.resolution}p`;
    const liveRendition = liveRenditionsMap.get(resKey);
    const chunks = liveRendition?.chunks || [];
    const completedChunks = chunks.filter((c) => {
      const s = (c.status || "").toUpperCase();
      return s === "DONE" || s === "COMPLETED" || s === "READY";
    }).length;
    const rawRenditionStatus = (liveRendition?.status || r.status || "").toUpperCase();
    return rawRenditionStatus === "READY" || rawRenditionStatus === "COMPLETED" || (chunks.length > 0 && completedChunks === chunks.length);
  });

  const isVideoStatusReady = videoStatus === "ready" || videoStatus === "completed";
  const isVideoFinalizing = !isVideoCancelling && !isVideoCancelled && (videoStatus === "finalizing" || allRenditionsReady || isVideoStatusReady);
  const isVideoReady = isVideoStatusReady;
  const isVideoProcessing = videoStatus === "processing" || isVideoFinalizing;
  const isKafkaQueueCompleted = isVideoReady || allRenditionsReady;
  return (
    <div
      className="w-full bg-white dark:bg-[#070a12] border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-5 md:p-6 space-y-4 shadow-xs font-sans relative"
    >
      
      {/* Stage 1: Raw Video Upload / S3 Ingestion */}
      <div className="flex flex-col items-center text-center space-y-1.5">
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50/80 px-3.5 py-2 font-sans text-xs text-emerald-800 shadow-xs dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <div className="relative h-8 w-12 shrink-0 overflow-hidden rounded border border-emerald-300 bg-slate-100 dark:border-emerald-500/30 dark:bg-slate-950/70">
            {video.thumbnailUrl ? (
              <div
                role="img"
                aria-label={`Thumbnail for ${video.filename}`}
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${JSON.stringify(video.thumbnailUrl).slice(1, -1)})` }}
              />
            ) : (
              <FileCode className="absolute inset-0 m-auto h-3.5 w-3.5 text-emerald-500/50" />
            )}
          </div>
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="font-semibold">Raw Video Upload (S3 Ingestion)</span>
          <span className="text-emerald-400 dark:text-emerald-600">•</span>
          <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">{video.filename}</span>
        </div>

        <ArrowDown strokeWidth={2} className="h-5 w-5 text-slate-400 dark:text-slate-600" />
      </div>

      {/* Stage 2: Job Planner Phase */}
      <div className="flex flex-col items-center text-center space-y-1.5">
        <div className={cn(
          "w-full max-w-md px-3.5 py-2 rounded-lg border font-sans text-xs flex items-center justify-between shadow-xs transition-colors",
          processingState?.planner_status === "COMPLETED" || isVideoProcessing
            ? "bg-emerald-50/80 border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
            : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-400"
        )}>
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Job Planner & Video Probing Phase</span>
          </div>
          <span className={cn(
            "text-[10px] font-sans px-2 py-0.5 rounded font-medium tracking-wide uppercase",
            processingState?.planner_status === "COMPLETED" || isVideoProcessing ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/20" : "text-slate-600 bg-slate-200 dark:text-slate-400 dark:bg-slate-800"
          )}>
            {processingState?.planner_status === "COMPLETED" || isVideoProcessing ? "Plan Complete" : "Planning"}
          </span>
        </div>

        <ArrowDown strokeWidth={2} className="h-5 w-5 text-slate-400 dark:text-slate-600" />
      </div>

      {/* Stage 3: Kafka Transcoding Queue */}
      <div className="flex flex-col items-center text-center space-y-1.5">
        <div className={cn(
          "w-full max-w-md px-3.5 py-2 rounded-lg border font-sans text-xs flex items-center justify-between shadow-xs transition-colors",
          isVideoCancelled
            ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300"
            : isKafkaQueueCompleted
            ? "bg-emerald-50/80 border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
            : isVideoProcessing
            ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300"
            : "bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-300"
        )}>
          <div className="flex items-center gap-2 font-semibold">
            {isVideoCancelled ? <XCircle className="h-4 w-4 shrink-0 text-rose-500" /> : <span className={cn(
              "h-2 w-2 rounded-full shrink-0",
              isKafkaQueueCompleted ? "bg-emerald-500" : isVideoProcessing ? "bg-amber-500 animate-ping" : "bg-sky-500"
            )} />}
            <span>Kafka Transcoding Queue</span>
          </div>
          <span className={cn(
            "text-[11px] font-mono px-2 py-0.5 rounded font-normal",
            isVideoCancelled
              ? "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-500/20"
              : isKafkaQueueCompleted
              ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/20"
              : isVideoProcessing
              ? "text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/20"
              : "text-sky-700 bg-sky-100 dark:text-sky-300 dark:bg-sky-500/20"
          )}>
            {isVideoCancelled ? "CANCELLED" : "video.transcode.jobs"}
          </span>
        </div>

        <ArrowDown strokeWidth={2} className="h-5 w-5 text-slate-400 dark:text-slate-600" />
      </div>

      {/* Stage 4: Parallel Worker Consumers Grid (360p, 480p, 720p, 1080p, 1440p) */}
      <div>
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-center font-sans text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Boxes className="h-4 w-4 text-sky-500" />
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

            // 1. WORKER DISPLAY ALGORITHM
            const activeProcessingChunks = chunks.filter(
              (chunk) => (chunk.status || "").toUpperCase() === "PROCESSING" && chunk.worker_id
            );
            const activeWorkersCount = activeProcessingChunks.length;

            // 2. CHUNK STATUS AGGREGATION
            const totalChunks = Math.max(liveRendition?.total_chunks || 0, chunks.length, 1);
            const completedChunks = chunks.filter((chunk) => {
              const s = (chunk.status || "").toUpperCase();
              return s === "DONE" || s === "COMPLETED" || s === "READY";
            }).length;

            const hasCompletedChunks = completedChunks > 0;
            const hasRetryingChunks = chunks.some(
              (chunk) => (chunk.status || "").toUpperCase() === "RETRYING"
            );
            const retryingChunk = chunks.find(
              (chunk) => (chunk.status || "").toUpperCase() === "RETRYING"
            );
            const allChunksDone = chunks.length > 0 && completedChunks === chunks.length;
            const rawRenditionStatus = (liveRendition?.status || r.status || "").toUpperCase();
            const isRenditionReady = rawRenditionStatus === "READY" || rawRenditionStatus === "COMPLETED";
            const isRenditionCancelling = rawRenditionStatus === "CANCELLING";
            const isRenditionCancelled = rawRenditionStatus === "CANCELLED";
            
            const isRenditionDone = isRenditionReady || allChunksDone;
            const anyChunkProcessing = activeWorkersCount > 0 || chunks.some((c) => (c.status || "").toUpperCase() === "PROCESSING");

            let derivedStatusLabel: "ready" | "processing" | "queued" | "cancelling" | "cancelled" = "queued";
            if (isRenditionCancelled) {
              derivedStatusLabel = "cancelled";
            } else if (isRenditionCancelling) {
              derivedStatusLabel = "cancelling";
            } else if (isRenditionDone) {
              derivedStatusLabel = "ready";
            } else if (anyChunkProcessing || hasCompletedChunks) {
              derivedStatusLabel = "processing";
            } else {
              derivedStatusLabel = "queued";
            }

            let workerDisplayName = "No workers";
            if (isRenditionDone) {
              workerDisplayName = "No workers";
            } else if (activeWorkersCount === 0) {
              if (hasRetryingChunks) {
                workerDisplayName = retryingChunk?.message || "Scheduled for retry";
              } else if (hasCompletedChunks && !allChunksDone) {
                workerDisplayName = "Waiting for worker";
              } else {
                workerDisplayName = "No workers";
              }
            } else if (activeWorkersCount === 1) {
              workerDisplayName = activeProcessingChunks[0]?.worker_id || "1 worker";
            } else {
              workerDisplayName = `${activeWorkersCount} workers`;
            }

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
            const roundedProgress = Math.round(progress);

            // Detect 99% Uploading to S3 vs 100% Ready state
            const isUploadingToS3 = !isRenditionDone && !isRenditionCancelled && !isRenditionCancelling && (roundedProgress === 99 || (progress >= 99 && progress < 100));

            const progressLabel = isUploadingToS3
              ? "Uploading to S3"
              : isRenditionDone || roundedProgress >= 100
              ? "100"
              : progress > 0 && progress < 1
              ? progress.toFixed(1)
              : roundedProgress.toString();

            const isSelected = selectedRenditionRes === resKey;
            const isReady = derivedStatusLabel === "ready";
            const isProcessing = derivedStatusLabel === "processing";
            const isQueued = derivedStatusLabel === "queued";
            const isTerminalCancelled = derivedStatusLabel === "cancelled";
            const displayCompletedChunks = isReady ? totalChunks : completedChunks;
            const isRetryScheduled = hasRetryingChunks && activeWorkersCount === 0;
            const hasActiveWorker = activeWorkersCount > 0 && !isRenditionDone;
            const hasNoWorker = ["Waiting for worker", "No workers"].includes(workerDisplayName);

            return (
              <div
                key={r.resolution}
                onClick={() => onSelectRendition?.(resKey)}
                className={cn(
                  "p-3.5 rounded-xl border transition-all font-sans text-xs flex flex-col justify-between space-y-2.5 relative overflow-hidden cursor-pointer hover:border-slate-400 dark:hover:border-slate-700 group",
                  isSelected && "ring-2 ring-sky-500 border-sky-500 shadow-sky-500/10",
                  (isProcessing || isUploadingToS3) && !isReady && !isSelected && "bg-sky-50/50 border-sky-300 dark:bg-slate-900/80 dark:border-sky-500/40",
                  isReady && !isSelected && "bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-500/30",
                  isTerminalCancelled && !isSelected && "bg-rose-50/40 border-rose-200 dark:bg-rose-950/20 dark:border-rose-500/30",
                  derivedStatusLabel === "cancelling" && !isSelected && "bg-slate-100 border-slate-200 dark:bg-slate-900/80 dark:border-slate-800",
                  isQueued && !isSelected && "bg-white border-slate-200 dark:bg-slate-900/40 dark:border-slate-800/80"
                )}
              >
                <div className="flex items-center justify-between relative z-10">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {isReady && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                    {isTerminalCancelled && <XCircle className="h-4 w-4 text-rose-500 shrink-0" />}
                    {derivedStatusLabel === "cancelling" && <Ban className="h-4 w-4 text-slate-500 shrink-0" />}
                    {r.resolution}
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border",
                      hasActiveWorker
                        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                        : isRetryScheduled && !isRenditionDone
                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
                        : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
                    )}
                    title={workerDisplayName}
                    aria-label={workerDisplayName}
                  >
                    {isRetryScheduled && !isRenditionDone ? (
                      <Clock3 className="h-3.5 w-3.5" />
                    ) : hasActiveWorker ? (
                      <Cpu className="h-3.5 w-3.5" />
                    ) : hasNoWorker || isRenditionDone ? (
                      <ServerOff className="h-3.5 w-3.5" />
                    ) : (
                      <Server className="h-3.5 w-3.5" />
                    )}
                  </span>
                </div>

                <div className="pt-0.5 relative z-10 flex items-center justify-start">
                  <WorkerNodeBadge
                    status={derivedStatusLabel}
                    workerDisplay={workerDisplayName}
                    className="max-w-full"
                  />
                </div>

                <div className="relative z-10 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                    {isTerminalCancelled ? (
                      <span className="font-medium text-rose-600 dark:text-rose-400">Cancelled</span>
                    ) : isUploadingToS3 ? (
                      <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <Database className="h-3 w-3 text-emerald-500 dark:text-emerald-400 animate-pulse shrink-0" />
                        <span>Uploading to S3...</span>
                      </span>
                    ) : (
                      <span className="font-medium">{progressLabel}%</span>
                    )}
                    <span className="font-mono text-[10px] text-slate-500">{displayCompletedChunks}/{totalChunks} chunks</span>
                  </div>
                  {!isTerminalCancelled && <div
                    className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                    aria-label={`${resKey} progress`}
                  >
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out",
                        isReady ? "bg-emerald-500" : "bg-sky-500"
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>}
                </div>
              </div>
            );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center text-center">
        <ArrowDown strokeWidth={2} className="h-5 w-5 text-slate-400 dark:text-slate-600 my-0.5" />
      </div>

      {/* Stage 5: Finalizing Video Step */}
      <div className="flex flex-col items-center text-center space-y-1.5">
        <div className={cn(
          "w-full max-w-2xl gap-4 px-3.5 py-2 rounded-lg border font-sans text-xs flex items-center justify-between shadow-xs transition-all",
          isVideoCancelled
            ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300"
            : isVideoReady
            ? "bg-emerald-50/80 border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-300"
            : isVideoFinalizing
            ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/50 dark:text-amber-300"
            : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-400"
        )}>
          <div className="flex min-w-0 items-center gap-2 text-left font-semibold">
            {isVideoReady ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : isVideoCancelled ? (
              <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
            ) : isVideoCancelling ? (
              <Ban className="h-4 w-4 text-slate-500 shrink-0" />
            ) : isVideoFinalizing ? (
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping shrink-0" />
            ) : (
              <FileCode className="h-4 w-4 text-slate-400 shrink-0" />
            )}
            <span className="min-w-0">
              {isVideoReady
                ? "Finalized Video: Master Playlist Ready (master.m3u8)"
                : isVideoCancelled
                ? "Finalizing Video: Assembling HLS Segments & Generating master.m3u8"
                : isVideoCancelling
                ? "Stopping video processing..."
                : isVideoFinalizing
                ? "Assembling HLS segments & Generating master.m3u8"
                : "Finalizing Video: Assembling HLS Segments & Generating master.m3u8"}
            </span>
          </div>
          <span className={cn(
            "shrink-0 text-[10px] font-sans px-2 py-0.5 rounded font-medium uppercase tracking-wide",
            isVideoReady
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
              : isVideoCancelled
              ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
              : isVideoFinalizing
              ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 animate-pulse"
              : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-500"
          )}>
            {isVideoReady ? "Master Ready" : isVideoCancelled ? "Cancelled" : isVideoCancelling ? "Cancelling" : isVideoFinalizing ? "Processing" : "Waiting"}
          </span>
        </div>
      </div>

      {/* Stage 6: HLS Packaging & CDN Output */}
      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-3 font-sans text-xs text-slate-500 sm:flex-row dark:border-slate-800/80 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-sky-500 shrink-0" />
          <span className={cn("font-medium", isVideoCancelled ? "text-rose-600 dark:text-rose-300" : "text-slate-700 dark:text-slate-200")}>HLS Master Playlist Output (<span className="font-mono">master.m3u8</span>)</span>
        </div>

        <div className="flex items-center gap-2">
          {isVideoCancelled ? <XCircle className="h-4 w-4 text-rose-500 shrink-0" /> : <Server className="h-4 w-4 text-emerald-500 shrink-0" />}
          <span className={cn("font-medium", isVideoCancelled ? "text-rose-600 dark:text-rose-300" : "text-slate-700 dark:text-slate-200")}>{isVideoCancelled ? "Master playlist not generated • Cancelled" : "S3 / CloudFront CDN Storage Ready"}</span>
        </div>
      </div>

    </div>
  );
}
