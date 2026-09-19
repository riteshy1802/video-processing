"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Video } from "@/types/video";
import { VideoAPI } from "@/lib/api/videos";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";

const VIDEO_PAGE_SIZE = 9;

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextOffsetRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  const updatePagination = useCallback((nextOffset: number, moreAvailable: boolean) => {
    nextOffsetRef.current = nextOffset;
    hasMoreRef.current = moreAvailable;
    setHasMore(moreAvailable);
  }, []);

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const page = await VideoAPI.getVideosPage(VIDEO_PAGE_SIZE, 0);
      setVideos(page.videos);
      updatePagination(page.nextOffset, page.hasMore);
    } catch {
      toast.error("Failed to load video library");
    } finally {
      setIsLoading(false);
    }
  }, [updatePagination]);

  const loadMoreVideos = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const page = await VideoAPI.getVideosPage(
        VIDEO_PAGE_SIZE,
        nextOffsetRef.current
      );
      setVideos((currentVideos) => {
        const existingIds = new Set(currentVideos.map((video) => video.id));
        const newVideos = page.videos.filter((video) => !existingIds.has(video.id));
        return [...currentVideos, ...newVideos];
      });
      updatePagination(page.nextOffset, page.hasMore);
    } catch {
      toast.error("Failed to load more videos");
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [updatePagination]);

  const refreshLoadedVideos = useCallback(async () => {
    const loadedCount = Math.max(VIDEO_PAGE_SIZE, nextOffsetRef.current);
    const page = await VideoAPI.getVideosPage(loadedCount, 0);
    setVideos(page.videos);
    updatePagination(page.nextOffset, page.hasMore);
  }, [updatePagination]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void fetchVideos();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fetchVideos]);

  // Only poll list if at least one video is in an active processing status
  useEffect(() => {
    const hasActiveProcessing = videos.some(
      (v) => v.status === "processing" || v.status === "uploading"
    );
    if (!hasActiveProcessing) return;

    const interval = setInterval(async () => {
      try {
        await refreshLoadedVideos();
      } catch {
        // Keep the current page visible if a background refresh temporarily fails.
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [videos, refreshLoadedVideos]);

  const handleVideoRenamed = useCallback((videoId: string, filename: string) => {
    setVideos((currentVideos) => currentVideos.map((video) => (
      video.id === videoId ? { ...video, filename } : video
    )));
  }, []);

  return (
    <div className="space-y-8">
      {/* Dashboard Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sans">
              Video Library
            </h1>
            <span className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-400 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold flex items-center">
              {videos.length}{hasMore ? "+" : ""} Assets
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl font-normal font-sans">
            Uploaded video assets are automatically prepared for seamless, high-performance adaptive streaming across any device.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Link href="/upload">
            <Button variant="primary" size="md">
              <Upload className="h-4 w-4 shrink-0" />
              <span>Upload Video</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Video Grid */}
      <VideoGrid
        videos={videos}
        isLoading={isLoading}
        onRefresh={fetchVideos}
        onVideoRenamed={handleVideoRenamed}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMoreVideos}
      />
    </div>
  );
}
