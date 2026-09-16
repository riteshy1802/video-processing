"use client";

import Link from "next/link";
import { Video } from "@/types/video";
import { VideoStatusBadge } from "./video-status-badge";
import { 
  formatBytes, 
  formatDuration, 
  formatDate, 
  getResolutionLabel 
} from "@/lib/utils";
import { Film, HardDrive, Clock, Play, Sparkles } from "lucide-react";

interface VideoCardProps {
  video: Video;
}

export function VideoCard({ video }: VideoCardProps) {
  const isProcessing = video.status === "processing";
  const isReady = video.status === "ready";
  const resolutionLabel = getResolutionLabel(video.width, video.height);

  const completedRenditions = video.renditions.filter((r) => r.status === "ready");
  const activeRenditions = video.renditions.filter((r) => r.status === "processing");

  return (
    <Link
      href={`/video/${video.id}`}
      className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 flex flex-col overflow-hidden shadow-sm hover:shadow-md dark:shadow-none cursor-pointer"
    >
      {/* Thumbnail Placeholder Section */}
      <div className="relative w-full aspect-video bg-slate-100 dark:bg-[#070a12] border-b border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 group-hover:opacity-60 transition-opacity" />

        {isReady ? (
          <div className="relative z-10 flex items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-sky-500/10 dark:bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 group-hover:scale-110 group-hover:bg-sky-600 dark:group-hover:bg-sky-500 group-hover:text-white dark:group-hover:text-slate-950 transition-all duration-200 shadow-sm">
              <Play className="h-5 w-5 ml-0.5 fill-current" />
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-2 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors">
            <Film className="h-8 w-8" />
            <span className="text-[10px] font-mono tracking-wider uppercase font-medium">
              {isProcessing ? "Transcoding..." : "Video Asset"}
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
          <VideoStatusBadge status={video.status} />
          {resolutionLabel !== "Unknown" && (
            <span className="bg-white/90 dark:bg-slate-950/90 backdrop-blur border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-mono font-semibold shadow-xs">
              {resolutionLabel}
            </span>
          )}
        </div>

        {/* Bottom Duration Badge */}
        {video.duration !== undefined && (
          <div className="absolute bottom-2.5 right-2.5 z-10 bg-white/90 dark:bg-slate-950/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 flex items-center gap-1 font-medium shadow-xs">
            <Clock className="h-3 w-3 text-slate-400" />
            <span>{formatDuration(video.duration)}</span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h3 className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors line-clamp-1">
            {video.filename}
          </h3>
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            ID: <span className="text-slate-700 dark:text-slate-300 font-medium">{video.id}</span>
          </p>
        </div>

        {/* Processing Details */}
        {isProcessing && (
          <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 space-y-1 font-mono text-[11px]">
            <div className="text-sky-700 dark:text-sky-400 font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400" />
              <span>Transcode Pipeline Active</span>
            </div>
            <div className="text-slate-600 dark:text-slate-400 text-[10px] space-y-0.5">
              {completedRenditions.map((r) => (
                <div key={r.resolution} className="flex justify-between">
                  <span>{r.resolution}:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Completed</span>
                </div>
              ))}
              {activeRenditions.map((r) => (
                <div key={r.resolution} className="flex justify-between">
                  <span>{r.resolution}:</span>
                  <span className="text-sky-600 dark:text-sky-400 animate-pulse font-medium">Processing</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Card Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <HardDrive className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium text-slate-700 dark:text-slate-300">{formatBytes(video.size)}</span>
          </div>
          <span>{formatDate(video.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
