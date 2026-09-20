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

function areVideosEqual(v1: Video, v2: Video): boolean {
  if (v1.id !== v2.id) return false;
  if (v1.status !== v2.status) return false;
  if (v1.filename !== v2.filename) return false;
  if (v1.duration !== v2.duration) return false;
  if (v1.size !== v2.size) return false;
  if ((v1.thumbnailVersion ?? 0) !== (v2.thumbnailVersion ?? 0)) return false;
  if ((v1.renditions?.length ?? 0) !== (v2.renditions?.length ?? 0)) return false;
  const v1Base = v1.thumbnailUrl?.split("?")[0] ?? "";
  const v2Base = v2.thumbnailUrl?.split("?")[0] ?? "";
  if (v1Base !== v2Base) return false;
  return true;
}

function stabilizeVideoThumbnails(newVideos: Video[], existingVideos: Video[]): Video[] {
  if (existingVideos.length === 0) return newVideos;

  const existingMap = new Map(existingVideos.map((v) => [v.id, v]));
  let allUnchanged = newVideos.length === existingVideos.length;

  const result = newVideos.map((v) => {
    const existing = existingMap.get(v.id);
    if (!existing) {
      allUnchanged = false;
      return v;
    }
    if (areVideosEqual(existing, v)) {
      return existing;
    }
    allUnchanged = false;
    const existingBase = existing.thumbnailUrl?.split("?")[0] ?? "";
    const newBase = v.thumbnailUrl?.split("?")[0] ?? "";
    const versionMatch = (existing.thumbnailVersion ?? 0) === (v.thumbnailVersion ?? 0);
    if (existingBase && existingBase === newBase && versionMatch) {
      return { ...v, thumbnailUrl: existing.thumbnailUrl };
    }
    return v;
  });

  return allUnchanged ? existingVideos : result;
}

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const nextOffsetRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const videosRef = useRef(videos);
  const searchQueryRef = useRef(searchQuery);
  const isInitialFetchedRef = useRef(false);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const updatePagination = useCallback((nextOffset: number, moreAvailable: boolean) => {
    nextOffsetRef.current = nextOffset;
    hasMoreRef.current = moreAvailable;
    setHasMore(moreAvailable);
  }, []);

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const page = await VideoAPI.getVideosPage(VIDEO_PAGE_SIZE, 0, "");
      setVideos((currentVideos) => stabilizeVideoThumbnails(page.videos, currentVideos));
      updatePagination(page.nextOffset, page.hasMore);
    } catch {
      toast.error("Failed to load video library");
    } finally {
      setIsLoading(false);
    }
  }, [updatePagination]);

  const handleSearchChange = useCallback(async (query: string) => {
    const trimmed = query.trim();
    setSearchQuery(trimmed);
    if (!trimmed) {
      void fetchVideos();
      return;
    }
    setIsLoading(true);
    try {
      const page = await VideoAPI.getVideosPage(100, 0, trimmed);
      setVideos((currentVideos) => stabilizeVideoThumbnails(page.videos, currentVideos));
      updatePagination(page.nextOffset, false);
    } catch {
      toast.error("Failed to search video library");
    } finally {
      setIsLoading(false);
    }
  }, [fetchVideos, updatePagination]);

  const loadMoreVideos = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || searchQueryRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const page = await VideoAPI.getVideosPage(
        VIDEO_PAGE_SIZE,
        nextOffsetRef.current,
        ""
      );
      setVideos((currentVideos) => {
        const stabilizedNew = stabilizeVideoThumbnails(page.videos, currentVideos);
        const existingIds = new Set(currentVideos.map((video) => video.id));
        const newVideos = stabilizedNew.filter((video) => !existingIds.has(video.id));
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
    const query = searchQueryRef.current;
    const loadedCount = Math.max(VIDEO_PAGE_SIZE, nextOffsetRef.current);
    const page = await VideoAPI.getVideosPage(loadedCount, 0, query);
    setVideos((currentVideos) => stabilizeVideoThumbnails(page.videos, currentVideos));
    const nextOffset = Math.max(nextOffsetRef.current, page.nextOffset);
    updatePagination(nextOffset, query ? false : page.hasMore);
  }, [updatePagination]);

  useEffect(() => {
    if (isInitialFetchedRef.current) return;
    isInitialFetchedRef.current = true;
    void fetchVideos();
  }, [fetchVideos]);

  // Only poll list every 5s if at least one video is in active processing status
  useEffect(() => {
    const interval = setInterval(async () => {
      const activeStatuses = new Set([
        "processing",
        "uploading",
        "queued",
        "pending_upload",
        "finalizing",
      ]);
      const hasActiveProcessing = videosRef.current.some((v) =>
        activeStatuses.has((v.status || "").toLowerCase())
      );
      if (!hasActiveProcessing) return;

      try {
        await refreshLoadedVideos();
      } catch {
        // Keep current page visible if background refresh fails temporarily
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshLoadedVideos]);

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
            <span className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-400 px-2.5 py-0.5 rounded-lg text-xs font-sans font-semibold flex items-center">
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
        onSearchChange={handleSearchChange}
        isSearching={Boolean(searchQuery)}
      />
    </div>
  );
}
