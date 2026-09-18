"use client";

import { Rendition, Video } from "@/types/video";
import { RenditionState, VideoProcessingState } from "@/lib/hooks/use-video-processing-events";
import { WorkerNodeBadge } from "./worker-node-badge";
import {
  Layers,
  Server,
  ArrowDown,
  CheckCircle2,
  Boxes,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KafkaArchitectureDiagramProps {
  video: Video;
  processingState?: VideoProcessingState | null;
}

function workerBadgeStatus(status: string): Rendition["status"] {
  if (status === "processing" || status === "ready" || status === "failed") return status;
  return "queued";
}

export function KafkaArchitectureDiagram({ video, processingState }: KafkaArchitectureDiagramProps) {
  // Merge live SSE renditions status with video.renditions
  const liveRenditionsMap = new Map<string, RenditionState>();
  if (processingState?.renditions) {
    processingState.renditions.forEach((r) => {
      const resKey = (r.resolution || "").endsWith("p") ? r.resolution : `${r.resolution}p`;
      liveRenditionsMap.set(resKey, r);
    });
  }

  // A planner event can arrive before the page's original video fetch contains
  // renditions. Render that event data immediately instead of an empty worker grid.
  const renditions: Rendition[] = video.renditions?.length
    ? video.renditions
    : (processingState?.renditions ?? []).map((rendition) => ({
      resolution: rendition.resolution,
      status: rendition.status.toLowerCase() as Rendition["status"],
      workerId: rendition.workerId,
    }));

  const videoStatus = (processingState?.video_status || video.status || "").toLowerCase();
  const isVideoProcessing = videoStatus === "processing" || videoStatus === "finalizing" || videoStatus === "ready";
  const isVideoFinalizing = videoStatus === "finalizing" || videoStatus === "ready";
  const isVideoReady = videoStatus === "ready";
  const kafkaActive = processingState?.planner_status === "COMPLETED";

  return (
    <div className="w-full bg-white dark:bg-[#070a12] border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-xs font-sans">
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
          processingState?.planner_status === "COMPLETED"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            : "bg-slate-900/60 border-slate-800 text-slate-400"
        )}>
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Job Planner & Video Probing Phase</span>
          </div>
          <span className={cn(
            "text-[11px] font-mono px-2 py-0.5 rounded font-semibold",
            processingState?.planner_status === "COMPLETED" ? "text-emerald-400 bg-emerald-500/20" : "text-slate-500 bg-slate-800"
          )}>
            {processingState?.planner_status === "COMPLETED" ? "PLAN COMPLETE" : "PLANNING"}
          </span>
        </div>

        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 3: Kafka Transcoding Queue */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className={cn(
          "w-full max-w-lg p-3.5 rounded-xl border font-mono text-xs flex items-center justify-between shadow-xs transition-colors delay-500",
          kafkaActive && isVideoProcessing ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-sky-500/10 border-sky-500/30 text-sky-300"
        )}>
          <div className="flex items-center gap-2 font-bold">
            <span className={cn("h-2 w-2 rounded-full shrink-0", kafkaActive && isVideoProcessing ? "bg-emerald-400 animate-ping" : "bg-sky-400")} />
            <span>Kafka Transcoding Queue</span>
          </div>
          <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded font-semibold", kafkaActive && isVideoProcessing ? "text-emerald-400 bg-emerald-500/20" : "text-sky-400 bg-sky-500/20")}>
            Topic: video.transcode.jobs
          </span>
        </div>

        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 4: Parallel Worker Consumers Grid (360p, 480p, 720p, 1080p, 1440p) */}
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
            const rawProgress = liveRendition?.progress ?? (currentStatus === "ready" ? 100 : 0);
            const progress = Number.isFinite(rawProgress)
              ? Math.min(100, Math.max(0, rawProgress))
              : 0;
            const progressLabel = progress > 0 && progress < 1
              ? progress.toFixed(1)
              : Math.round(progress).toString();
            const totalChunks = liveRendition?.total_chunks ?? 0;
            const completedChunks = liveRendition?.completed_chunks ?? 0;

            const isProcessing = currentStatus === "processing";
            const isReady = currentStatus === "ready";
            const isQueued = currentStatus === "queued" || currentStatus === "pending";
            const defaultWorker = `Worker-${resKey}`;
            const workerId = liveRendition?.workerId || r.workerId;
            const workerName = workerId ? workerId.replace("worker-", "Worker-") : defaultWorker;

            return (
              <div
                key={r.resolution}
                className={cn(
                  "p-4 rounded-xl border transition-all font-mono text-xs flex flex-col justify-between space-y-3 shadow-sm relative overflow-hidden",
                  isProcessing && "bg-slate-900/80 border-emerald-500/50 text-emerald-200 shadow-emerald-500/10",
                  isReady && "bg-emerald-950/40 border-emerald-500/40 text-emerald-100 shadow-md",
                  isQueued && "bg-slate-900/40 border-slate-800 text-slate-400"
                )}
              >
                <div className="flex items-center justify-between relative z-10">
                  <span className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                    {isReady && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                    {r.resolution}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                    {workerName}
                  </span>
                </div>

                <div className="pt-1 relative z-10">
                  <WorkerNodeBadge status={workerBadgeStatus(currentStatus)} workerId={workerId || `worker-${r.resolution}`} />
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
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-400 transition-[width] duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center text-center my-2">
        <ArrowDown className="h-6 w-6 text-emerald-500/60 mt-3" />
      </div>

      {/* Stage 5: Finalizing Video Step */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className={cn(
          "w-full max-w-lg p-3.5 rounded-xl border font-mono text-xs flex items-center justify-between shadow-xs transition-all",
          isVideoFinalizing ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-bold" : "bg-slate-900/60 border-slate-800 text-slate-400"
        )}>
          <div className="flex items-center gap-2">
            {isVideoFinalizing ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <FileCode className="h-4 w-4 text-slate-500 shrink-0" />
            )}
            <span>Finalizing Video: Assembling HLS Segments & Generating master.m3u8</span>
          </div>
          <span className={cn(
            "text-[10px] font-mono px-2 py-0.5 rounded font-semibold",
            isVideoFinalizing ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800 text-slate-500"
          )}>
            {isVideoReady ? "MASTER READY" : isVideoFinalizing ? "FINALIZING" : "WAITING"}
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
