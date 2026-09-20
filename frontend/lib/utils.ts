import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ResolutionType } from "@/types/video";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes?: number, decimals = 1): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${remMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}


export function getExpectedRenditions(height?: number): ResolutionType[] {
  if (!height) return ["360p"];
  
  const RENDITIONS: { label: ResolutionType; targetHeight: number }[] = [
    { label: "360p", targetHeight: 360 },
    { label: "480p", targetHeight: 480 },
    { label: "720p", targetHeight: 720 },
    { label: "1080p", targetHeight: 1080 },
    { label: "1440p", targetHeight: 1440 },
    { label: "2160p", targetHeight: 2160 },
  ];

  const matched = RENDITIONS.filter(
    (r) => height >= r.targetHeight * 0.9 || r.targetHeight === 360
  ).map((r) => r.label);

  return matched.length > 0 ? matched : ["360p"];
}

export function getResolutionLabel(width?: number, height?: number): string {
  if (!width || !height) return "Unknown";
  if (height >= 2160 || width >= 3840) return "4K UHD";
  if (height >= 1440 || width >= 2560) return "1440p QHD";
  if (height >= 1080 || width >= 1920) return "1080p FHD";
  if (height >= 720 || width >= 1280) return "720p HD";
  if (height >= 480 || width >= 854) return "480p SD";
  if (height >= 360 || width >= 640) return "360p SD";
  return `${height}p`;
}
