"use client";

import { useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import { Video } from "@/types/video";
import { VideoAPI } from "@/lib/api/videos";
import { VideoStatusBadge } from "./video-status-badge";
import { 
  formatBytes, 
  formatDuration, 
  formatDate, 
  getResolutionLabel 
} from "@/lib/utils";
import { Film, HardDrive, Clock, Play, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

interface VideoCardProps {
  video: Video;
  onRenamed?: (videoId: string, filename: string) => void;
}

function splitFilename(filename: string = ""): { name: string; extension: string } {
  if (!filename) return { name: "Untitled", extension: "" };
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) return { name: filename, extension: "" };
  return {
    name: filename.slice(0, lastDot),
    extension: filename.slice(lastDot),
  };
}

export function VideoCard({ video, onRenamed }: VideoCardProps) {
  if (!video) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isProcessing = video.status === "processing";
  const isReady = video.status === "ready";
  const statusLower = (video.status || "").toLowerCase();
  const isCancelled = statusLower === "cancelled" || statusLower === "canceled" || statusLower === "cancelling";
  const canRename = Boolean(video.id && !video.id.startsWith("vid_demo_"));
  const resolutionLabel = getResolutionLabel(video.width, video.height);
  const { name: currentName, extension } = splitFilename(video.filename || "Untitled.mp4");

  const beginEditing = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDraftName(currentName);
    setIsEditing(true);
  };

  const discardEditing = () => {
    setDraftName(currentName);
    setIsEditing(false);
  };

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextName = draftName.trim();
    if (!nextName || nextName === currentName || isSaving) {
      if (nextName === currentName) discardEditing();
      return;
    }

    setIsSaving(true);
    try {
      const filename = await VideoAPI.renameVideo(video.id, nextName);
      onRenamed?.(video.id, filename);
      setIsEditing(false);
      toast.success(`Renamed to ${filename}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename video");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-[#111726] dark:shadow-none dark:hover:border-slate-700">
      <Link
        href={`/video/${video.id}`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-label={`Open ${video.filename}`}
      />
      {/* Thumbnail Section */}
      <div className="pointer-events-none relative z-10 flex aspect-video w-full items-center justify-center overflow-hidden border-b border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-[#070a12]">
        {video.thumbnailUrl && (
          <div
            role="img"
            aria-label={`Thumbnail for ${video.filename}`}
            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.02]"
            style={{ backgroundImage: `url(${JSON.stringify(video.thumbnailUrl).slice(1, -1)})` }}
          />
        )}
        {/* Subtle grid pattern background */}
        {!video.thumbnailUrl && (
          <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 group-hover:opacity-60 transition-opacity" />
        )}
        {video.thumbnailUrl && <div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/25" />}

        {isReady ? (
          <div className="relative z-10 flex items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-sky-500/10 dark:bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 group-hover:scale-110 group-hover:bg-sky-600 dark:group-hover:bg-sky-500 group-hover:text-white dark:group-hover:text-slate-950 transition-all duration-200 shadow-sm">
              <Play className="h-5 w-5 ml-0.5 fill-current" />
            </div>
          </div>
        ) : isCancelled ? null : (
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
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col justify-between space-y-3 p-4">
        <div>
          {isEditing ? (
            <form
              onSubmit={saveName}
              className="pointer-events-auto flex min-w-0 items-center gap-1.5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-sky-500/60 bg-slate-50 px-2 focus-within:ring-2 focus-within:ring-sky-500/20 dark:bg-slate-950">
                <input
                  autoFocus
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      discardEditing();
                    }
                  }}
                  maxLength={Math.max(1, 255 - extension.length)}
                  className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-xs font-semibold text-slate-900 outline-none dark:text-slate-100"
                  aria-label="Video name"
                />
                <span className="shrink-0 font-mono text-xs text-slate-500">{extension}</span>
              </div>
              <button
                type="submit"
                disabled={!draftName.trim() || isSaving}
                className="rounded-md p-1.5 text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                title="Save name"
                aria-label="Save video name"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={discardEditing}
                disabled={isSaving}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
                title="Discard changes"
                aria-label="Discard video name changes"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <h3 className="line-clamp-1 font-sans text-sm font-semibold text-slate-900 transition-colors group-hover:text-sky-600 dark:text-slate-100 dark:group-hover:text-sky-400" title={video.filename}>
              {video.filename}
            </h3>
          )}
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1 truncate">
            ID: <span className="text-slate-700 dark:text-slate-300 font-normal">{video.id}</span>
          </p>
        </div>

        {/* Card Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-sans text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <HardDrive className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium text-slate-700 dark:text-slate-300 font-mono text-[11px]">{formatBytes(video.size)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {canRename && !isEditing && (
              <button
                type="button"
                onClick={beginEditing}
                className="pointer-events-auto rounded p-1 text-slate-400 opacity-0 transition-all hover:bg-sky-500/10 hover:text-sky-500 focus:opacity-100 group-hover:opacity-100 cursor-pointer"
                title="Rename video"
                aria-label={`Rename ${video.filename}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <span>{formatDate(video.createdAt)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
