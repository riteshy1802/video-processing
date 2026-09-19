"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Video } from "@/types/video";
import { VideoAPI } from "@/lib/api/videos";
import { VideoStatusBadge } from "@/components/video/video-status-badge";
import { RenditionStatusList } from "@/components/video/rendition-status";
import { ProcessingState } from "@/components/processing/processing-state";
import { VideoPlayer } from "@/components/video/video-player";
import { ThumbnailUploadButton } from "@/components/video/thumbnail-upload-button";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { useVideoProcessingEvents } from "@/lib/hooks/use-video-processing-events";
import {
  cn,
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
  X,
  Info,
} from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { toast } from "sonner";

export default function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { isCollapsed } = useSidebar();

  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isThumbnailPreviewOpen, setIsThumbnailPreviewOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>("auto");
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleVideoCompleted = useCallback(() => {
    if (countdown !== null) return;
    setCountdown(10);
  }, [countdown]);

  const handleThumbnailReady = useCallback((
    thumbnailUrl: string,
    thumbnailVersion: number
  ) => {
    setVideo((current) => current ? {
      ...current,
      thumbnailUrl,
      thumbnailVersion,
    } : current);
  }, []);

  const { processingState, isConnected, isCompleted } = useVideoProcessingEvents(id, {
    enabled: !!video && (video.status || "").toLowerCase() !== "ready",
    onVideoReady: handleVideoCompleted,
    onThumbnailReady: handleThumbnailReady,
  });

  // Handle 5 -> 4 -> 3 -> 2 -> 1 countdown tick
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      window.location.reload();
      setCountdown(null);
      return;
    }

    countdownTimerRef.current = setTimeout(() => {
      setCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
  }, [countdown]);

  useEffect(() => {
    if (!isThumbnailPreviewOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsThumbnailPreviewOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isThumbnailPreviewOpen]);

  const handleForcePlay = () => {
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    setCountdown(null);
    window.location.reload();
  };

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

  const isReady = (video.status || "").toLowerCase() === "ready";
  const resolutionLabel = getResolutionLabel(video.width, video.height);
  const renditionsSummary = video.renditions.map((r) => r.resolution).join(", ");

  return (
    <>
      <div
      className={cn(
        "relative left-1/2 w-[calc(100vw-2rem)] max-w-[112rem] -translate-x-1/2 space-y-8 font-sans",
        isCollapsed
          ? "md:w-[calc(100vw-8rem)]"
          : "md:w-[calc(100vw-20rem)]"
      )}
    >
      {/* Video Detail Header */}
      <div className="border-b border-slate-200/80 pb-6 dark:border-slate-800/60">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="max-w-4xl truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {video.filename}
            </h1>
            <VideoStatusBadge status={video.status} />
          </div>
          <p className="pl-11 font-mono text-xs text-slate-500 dark:text-slate-400">
            Asset ID: <span className="font-medium text-slate-900 dark:text-slate-200">{video.id}</span> • Uploaded {formatDate(video.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-6">
          {/* Main Player / Processing Display */}
          {isReady && video.playbackUrl ? (
            <>
              <VideoPlayer
                src={video.playbackUrl}
                poster={video.thumbnailUrl}
                autoPlay={false}
                deferLoadingUntilPlay
                selectedQuality={selectedQuality}
                onQualityChange={setSelectedQuality}
                onMetadataLoaded={handleMetadataLoaded}
                renditions={video.renditions}
              />

              <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 font-mono text-xs text-emerald-700 shadow-xs dark:text-emerald-400">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>All multi-resolution HLS renditions ({renditionsSummary}) are ready for adaptive streaming.</span>
                </div>
              </div>
            </>
          ) : (
            <ProcessingState
              video={video}
              processingState={processingState}
              isConnected={isConnected}
              isCompleted={isCompleted}
              countdown={countdown}
              onForcePlay={handleForcePlay}
            />
          )}

          {isReady && (
            <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800/60 dark:bg-[#111726]">
              <h3 className="flex items-center gap-2 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                <Layers className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                <span>Generated HLS Rendition Playlists</span>
              </h3>
              <RenditionStatusList renditions={video.renditions} />
            </div>
          )}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800/60 dark:bg-[#111726]">
          <div className="border-b border-slate-200/80 px-3.5 py-2.5 dark:border-slate-800/80">
            <h2 className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">Asset details</h2>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Thumbnail and source metadata</p>
          </div>

          <div className="space-y-3 p-3">
            <div className="space-y-2">
              <div className="group/preview relative aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                {video.thumbnailUrl ? (
                  <>
                    <div
                      role="img"
                      aria-label={`Thumbnail for ${video.filename}`}
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover/preview:scale-[1.02]"
                      style={{ backgroundImage: `url(${JSON.stringify(video.thumbnailUrl).slice(1, -1)})` }}
                    />
                    <button
                      type="button"
                      onClick={() => setIsThumbnailPreviewOpen(true)}
                      className="absolute inset-0 flex cursor-zoom-in items-center justify-center bg-slate-950/0 text-white transition-colors duration-200 hover:bg-slate-950/45 focus-visible:bg-slate-950/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400"
                      aria-label={`Open full-screen thumbnail for ${video.filename}`}
                    >
                      <span className="flex h-10 w-10 scale-90 items-center justify-center rounded-xl border border-white/25 bg-black/45 opacity-0 shadow-xl backdrop-blur-sm transition-all duration-200 group-hover/preview:scale-100 group-hover/preview:opacity-100 group-focus-within/preview:scale-100 group-focus-within/preview:opacity-100">
                        <Maximize2 className="h-4 w-4" />
                      </span>
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400 dark:text-slate-600">
                    <Film className="h-6 w-6" />
                    <span className="font-mono text-[11px] uppercase tracking-wider">No thumbnail yet</span>
                  </div>
                )}
              </div>

              {!video.id.startsWith("vid_demo_") && (
                isReady ? (
                  <ThumbnailUploadButton
                    videoId={video.id}
                    filename={video.filename}
                    onUploaded={handleThumbnailReady}
                    label="Replace thumbnail"
                    className="h-8.5 w-full border-sky-500/25 bg-sky-500/10 text-xs text-sky-700 shadow-none hover:bg-sky-500/15 dark:text-sky-300"
                  />
                ) : (
                  <div className="group/info relative flex items-center gap-2 rounded-lg border border-sky-200/80 bg-sky-50/70 p-2.5 font-mono text-[11px] text-sky-800 shadow-xs dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                    <Info className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    <span className="leading-tight">
                      Autogenerated thumbnail will appear here with the highest resolution rendition.
                    </span>
                    {/* Hover tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-60 -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-900 p-2.5 font-sans text-[11px] font-medium text-slate-200 shadow-xl group-hover/info:block z-50">
                      Autogenerated Thumbnail will appear here with the one having highest resolution, you may change it later in the video details.
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="divide-y divide-slate-200/80 border-y border-slate-200/80 font-mono dark:divide-slate-800/80 dark:border-slate-800/80">
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><HardDrive className="h-3.5 w-3.5" /> Size</span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{formatBytes(video.size)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><Clock className="h-3.5 w-3.5" /> Duration</span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{formatDuration(video.duration)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><Maximize2 className="h-3.5 w-3.5" /> Resolution</span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{resolutionLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><Layers className="h-3.5 w-3.5" /> Mime type</span>
                <span className="max-w-[55%] truncate text-xs font-bold text-slate-900 dark:text-slate-100" title={video.mimeType || "video/mp4"}>{video.mimeType || "video/mp4"}</span>
              </div>
            </div>

            {isReady && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteModalOpen(true)}
                className="w-full h-8.5 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete asset</span>
              </Button>
            )}
          </div>
          </div>

          <div id="rendition-details-panel-slot" />
        </aside>
      </div>

      </div>

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
        confirmationText={video.filename}
      />

      {isThumbnailPreviewOpen && video.thumbnailUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Full-screen thumbnail for ${video.filename}`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md sm:p-8"
          onClick={() => setIsThumbnailPreviewOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsThumbnailPreviewOpen(false)}
            className="absolute right-5 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/50 text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            aria-label="Close full-screen thumbnail"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            role="img"
            aria-label={`Thumbnail for ${video.filename}`}
            className="h-full w-full bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${JSON.stringify(video.thumbnailUrl).slice(1, -1)})` }}
            onClick={(event) => event.stopPropagation()}
          />
          <div className="pointer-events-none absolute inset-x-6 bottom-5 truncate text-center font-mono text-xs text-white/70">
            {video.filename}
          </div>
        </div>
      )}
    </>
  );
}
