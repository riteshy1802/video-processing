"use client";

import { useState } from "react";
import Link from "next/link";
import { Video } from "@/types/video";
import { VideoCard } from "./video-card";
import { VideoCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PopoverDropdown } from "@/components/ui/popover-dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { Film, Upload, Search, Filter, RefreshCw } from "lucide-react";

interface VideoGridProps {
  videos: Video[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "all" },
  { label: "Ready", value: "ready" },
  { label: "Processing", value: "processing" },
  { label: "Queued", value: "queued" },
  { label: "Uploading", value: "uploading" },
];

export function VideoGrid({ videos, isLoading = false, onRefresh }: VideoGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredVideos = videos.filter((video) => {
    const matchesSearch = video.filename
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || video.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] p-12 text-center flex flex-col items-center justify-center max-w-2xl mx-auto space-y-5 my-8 shadow-xs">
        <div className="h-16 w-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
          <Film className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            No videos in your library
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Upload your first video file. It will be transcoded automatically into multi-resolution adaptive HLS streams (360p up to 1440p based on source resolution).
          </p>
        </div>
        <Link href="/upload">
          <Button variant="primary" size="md">
            <Upload className="h-4 w-4" />
            <span>Upload Your First Video</span>
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#111726] shadow-xs">
        {/* Search Input Container - Vertically Centered Flex items */}
        <div className="w-full sm:w-80 flex items-center h-10 bg-slate-50 dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 gap-2.5 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/10 transition-all">
          <Search className="h-4 w-4 text-slate-400 shrink-0 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter by filename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-0 p-0 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-0 leading-none"
          />
        </div>

        {/* Filter Dropdown & Refresh Action */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end h-10">
          <div className="flex items-center gap-2 font-mono text-xs text-slate-600 dark:text-slate-400">
            <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>Status:</span>
            
            {/* Custom Popover Dropdown replacing native select */}
            <PopoverDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
            />
          </div>

          {onRefresh && (
            <Tooltip content="Refresh Video List" position="top">
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="text-slate-600 dark:text-slate-400 h-9"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Grid Container */}
      {filteredVideos.length === 0 ? (
        <div className="p-8 text-center border border-slate-200 dark:border-slate-800 rounded-2xl font-mono text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-[#111726]">
          No videos matched your filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
