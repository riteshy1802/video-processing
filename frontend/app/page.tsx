"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Video } from "@/types/video";
import { VideoAPI } from "@/lib/api/videos";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Upload, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await VideoAPI.getVideos();
      setVideos(data);
    } catch (e) {
      toast.error("Failed to load video library");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Only poll list if at least one video is in an active processing status
  useEffect(() => {
    const hasActiveProcessing = videos.some(
      (v) => v.status === "processing" || v.status === "uploading"
    );
    if (!hasActiveProcessing) return;

    const interval = setInterval(async () => {
      const updated = await VideoAPI.getVideos();
      setVideos(updated);
    }, 5000);

    return () => clearInterval(interval);
  }, [videos]);

  const handleResetData = async () => {
    const reset = await VideoAPI.resetMockData();
    setVideos(reset);
    toast.success("Demo dataset reset to initial state");
  };

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
              {videos.length} Assets
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl font-normal font-sans">
            Uploaded video assets are automatically prepared for seamless, high-performance adaptive streaming across any device.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Tooltip content="Reset Demo Dataset" position="bottom">
            <Button
              variant="outline"
              size="md"
              onClick={handleResetData}
              className="font-mono text-xs"
            >
              <RotateCcw className="h-4 w-4 shrink-0" />
              <span>Reset Demo</span>
            </Button>
          </Tooltip>

          <Link href="/upload">
            <Button variant="primary" size="md">
              <Upload className="h-4 w-4 shrink-0" />
              <span>Upload Video</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Video Grid */}
      <VideoGrid videos={videos} isLoading={isLoading} onRefresh={fetchVideos} />
    </div>
  );
}
