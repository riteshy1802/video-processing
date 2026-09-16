"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Video } from "@/types/video";
import { VideoAPI } from "@/lib/api/videos";
import { VideoStatusBadge } from "@/components/video/video-status-badge";
import { RenditionStatusList } from "@/components/video/rendition-status";
import { ProcessingState } from "@/components/processing/processing-state";
import { VideoPlayer } from "@/components/video/video-player";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { 
  formatBytes, 
  formatDuration, 
  formatDate, 
  getResolutionLabel 
} from "@/lib/utils";
import { 
  ArrowLeft, 
  Film, 
  HardDrive, 
  Clock, 
  Maximize2, 
  Layers, 
  Trash2, 
  CheckCircle2,
  RefreshCw
} from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { toast } from "sonner";

export default function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchVideo = useCallback(async () => {
    try {
      const data = await VideoAPI.getVideo(id);
      if (!data) {
        setNotFound(true);
      } else {
        setVideo(data);
      }
    } catch (e) {
      toast.error("Failed to load video details");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

  // Status polling temporarily disabled
  // useEffect(() => {
  //   const currentStatus = video?.status?.toLowerCase();
  //   if (!video || (currentStatus !== "processing" && currentStatus !== "uploading" && currentStatus !== "pending_upload")) {
  //     return;
  //   }
  //
  //   const interval = setInterval(async () => {
  //     const data = await VideoAPI.getVideo(id);
  //     if (data) {
  //       setVideo(data);
  //     }
  //   }, 5000);
  //
  //   return () => clearInterval(interval);
  // }, [id, video?.status]);




  const handleConfirmDelete = async () => {
    if (!video) return;
    try {
      setIsDeleting(true);
      await VideoAPI.deleteVideo(video.id);
      toast.success("Video asset deleted successfully from library");
      window.location.href = "/";
    } catch (e) {
      toast.error("Failed to delete video asset");
      setIsDeleting(false);
    }
  };

  const handleMetadataLoaded = useCallback((meta: { duration: number; width: number; height: number }) => {
    setVideo((prev) => {
      if (!prev) return null;
      if (prev.duration && prev.width && prev.height) return prev;
      return {
        ...prev,
        duration: prev.duration || meta.duration,
        width: prev.width || meta.width,
        height: prev.height || meta.height,
      };
    });
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-96 w-full bg-slate-100 dark:bg-slate-900 rounded-xl" />
      </div>
    );
  }

  if (notFound || !video) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
        <Film className="h-10 w-10 text-slate-400 dark:text-slate-600 mx-auto" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Video Not Found</h3>
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
          No video asset registered with ID: {id}
        </p>
        <Link href="/">
          <Button variant="primary" size="sm">
            Back to Library
          </Button>
        </Link>
      </div>
    );
  }

  const isReady = video.status === "ready";
  const resolutionLabel = getResolutionLabel(video.width, video.height);
  const renditionsSummary = video.renditions.map((r) => r.resolution).join(", ");

  return (
    <div className="max-w-5xl mx-auto space-y-8 font-sans">
      {/* Video Detail Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate max-w-xl">
              {video.filename}
            </h1>
            <VideoStatusBadge status={video.status} />
          </div>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 pl-11">
            Asset ID: <span className="text-slate-900 dark:text-slate-200 font-medium">{video.id}</span> • Uploaded {formatDate(video.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Refresh Status" position="bottom">
            <Button
              variant="outline"
              size="md"
              onClick={fetchVideo}
              className="text-slate-600 dark:text-slate-400"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Tooltip content="Delete Video Asset" position="bottom">
            <Button
              variant="destructive"
              size="md"
              onClick={() => setIsDeleteModalOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Main Player / Processing Display */}
      {video.playbackUrl ? (
        <div className="space-y-6">
          <VideoPlayer
            src={video.playbackUrl}
            autoPlay={false}
            onMetadataLoaded={handleMetadataLoaded}
          />
          
          {isReady ? (
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between font-mono text-xs text-emerald-700 dark:text-emerald-400 shadow-xs">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>All multi-resolution HLS renditions ({renditionsSummary}) are ready for adaptive streaming.</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 flex items-center justify-between font-mono text-xs text-sky-700 dark:text-sky-400 shadow-xs">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-500" />
                <span>Original S3 video asset verified and available for playback.</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ProcessingState video={video} />
      )}

      {/* Technical Specifications Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#111726] font-mono text-xs shadow-xs">
        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 font-semibold">
            <HardDrive className="h-3.5 w-3.5" /> Size
          </span>
          <p className="font-bold text-slate-900 dark:text-slate-100">{formatBytes(video.size)}</p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 font-semibold">
            <Clock className="h-3.5 w-3.5" /> Duration
          </span>
          <p className="font-bold text-slate-900 dark:text-slate-100">{formatDuration(video.duration)}</p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 font-semibold">
            <Maximize2 className="h-3.5 w-3.5" /> Original Resolution
          </span>
          <p className="font-bold text-slate-900 dark:text-slate-100">{resolutionLabel}</p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 font-semibold">
            <Layers className="h-3.5 w-3.5" /> Mime Type
          </span>
          <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{video.mimeType || "video/mp4"}</p>
        </div>
      </div>

      {/* Renditions List */}
      {isReady && (
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#111726] p-6 space-y-4 shadow-xs">
          <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Layers className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>Generated HLS Rendition Playlists</span>
          </h3>
          <RenditionStatusList renditions={video.renditions} />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Video Asset?"
        description={`Are you sure you want to delete "${video.filename}"? This will permanently remove the video asset and all generated adaptive HLS renditions (${renditionsSummary}).`}
        confirmText="Delete Asset"
        cancelText="Cancel"
        isDeleting={isDeleting}
      />
    </div>
  );
}
