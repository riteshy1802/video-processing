"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChunkProgressState,
  ProcessingSnapshot,
  RenditionProgressState,
  ResolutionType,
} from "@/types/video";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const COMPLETE_CHUNK_STATUSES = new Set(["DONE", "COMPLETED", "READY"]);

export interface RenditionState extends RenditionProgressState {
  workerId?: string;
}

export interface VideoProcessingState extends Omit<ProcessingSnapshot, "renditions"> {
  planner_status: "PENDING" | "COMPLETED";
  renditions: RenditionState[];
}

interface UseVideoProcessingEventsOptions {
  enabled?: boolean;
  onVideoReady?: () => void;
  onThumbnailReady?: (thumbnailUrl: string, thumbnailVersion: number) => void;
}

function resolutionLabel(value: unknown): ResolutionType {
  const raw = String(value ?? "");
  if (!raw) return "";
  return raw.endsWith("p") ? raw : `${raw}p`;
}

function chunkFrom(data: Record<string, unknown>): ChunkProgressState {
  const chunk: ChunkProgressState = {
    chunk_id: String(data.chunk_id),
    chunk_index: Number(data.chunk_index ?? 0),
    rendition_id: String(data.rendition_id ?? ""),
    resolution: resolutionLabel(data.resolution),
    worker_id: typeof data.worker_id === "string" ? data.worker_id : undefined,
    status: String(data.status ?? "PENDING").toUpperCase() as ChunkProgressState["status"],
    progress: Math.max(0, Math.min(100, Number(data.progress ?? 0))),
    start_seconds: typeof data.start_seconds === "number" ? data.start_seconds : undefined,
    end_seconds: typeof data.end_seconds === "number" ? data.end_seconds : undefined,
    error: typeof data.error === "string" ? data.error : undefined,
    message: typeof data.message === "string" ? data.message : undefined,
  };
  if (data.ffmpeg && typeof data.ffmpeg === "object") {
    chunk.ffmpeg = data.ffmpeg as ChunkProgressState["ffmpeg"];
  }
  return chunk;
}

function aggregateRendition(rendition: RenditionState): RenditionState {
  const totalChunks = Math.max(rendition.total_chunks, rendition.chunks.length);
  const completedChunks = rendition.chunks.filter((chunk) => COMPLETE_CHUNK_STATUSES.has(chunk.status)).length;
  const progress = rendition.status === "READY"
    ? 100
    : totalChunks
      ? rendition.chunks.reduce((sum, chunk) => sum + Math.max(0, Math.min(100, chunk.progress)), 0) / totalChunks
      : 0;
  return {
    ...rendition,
    total_chunks: totalChunks,
    completed_chunks: completedChunks,
    progress: Math.round(progress * 10) / 10,
  };
}

function aggregateVideo(state: VideoProcessingState): VideoProcessingState {
  const renditions = state.renditions.map(aggregateRendition);
  const totalChunks = renditions.reduce((sum, rendition) => sum + rendition.total_chunks, 0);
  const completedChunks = renditions.reduce((sum, rendition) => sum + rendition.completed_chunks, 0);
  const weightedProgress = renditions.reduce((sum, rendition) => sum + rendition.progress * rendition.total_chunks, 0);
  return {
    ...state,
    renditions,
    total_renditions: renditions.length,
    total_chunks: totalChunks,
    completed_chunks: completedChunks,
    overall_progress: totalChunks ? Math.round((weightedProgress / totalChunks) * 10) / 10 : 0,
  };
}

function renditionFrom(data: Record<string, unknown>): RenditionState {
  const chunks = Array.isArray(data.chunks)
    ? data.chunks.map((chunk) => chunkFrom(chunk as Record<string, unknown>))
    : [];
  return aggregateRendition({
    rendition_id: String(data.rendition_id ?? data.id ?? ""),
    resolution: resolutionLabel(data.resolution),
    status: String(data.status ?? "PENDING").toUpperCase() as RenditionProgressState["status"],
    progress: Number(data.progress ?? 0),
    total_chunks: Number(data.total_chunks ?? chunks.length),
    completed_chunks: Number(data.completed_chunks ?? 0),
    chunks,
    workerId: typeof data.worker_id === "string" ? data.worker_id : undefined,
  });
}

function snapshotFrom(videoId: string, data: Record<string, unknown>): VideoProcessingState {
  const rawRenditions = Array.isArray(data.renditions)
    ? data.renditions.map((rendition) => renditionFrom(rendition as Record<string, unknown>))
    : [];
  const renditions = [...rawRenditions].sort((a, b) => {
    const resA = parseInt(String(a.resolution).replace(/\D/g, ""), 10) || 0;
    const resB = parseInt(String(b.resolution).replace(/\D/g, ""), 10) || 0;
    return resA - resB;
  });
  return aggregateVideo({
    video_id: String(data.video_id ?? videoId),
    video_status: String(data.status ?? data.video_status ?? "PROCESSING").toUpperCase(),
    planner_status: renditions.length ? "COMPLETED" : "PENDING",
    total_renditions: 0,
    total_chunks: 0,
    completed_chunks: 0,
    overall_progress: 0,
    renditions,
  });
}

function applyEvent(previous: VideoProcessingState | null, videoId: string, data: Record<string, unknown>) {
  const type = String(data.type ?? "");
  if (type === "planner.completed") {
    return { ...snapshotFrom(videoId, data), planner_status: "COMPLETED" as const };
  }

  let next = previous ?? snapshotFrom(videoId, {});
  if (type === "video.processing") next = { ...next, video_status: "PROCESSING" };
  if (type === "video.finalizing") next = { ...next, video_status: "FINALIZING" };
  if (type === "video.ready") next = { ...next, video_status: "READY" };
  if (type === "video.failed") next = { ...next, video_status: "FAILED" };

  const renditionId = String(data.rendition_id ?? "");
  const resolution = resolutionLabel(data.resolution);
  const renditionIndex = next.renditions.findIndex((rendition) => rendition.rendition_id === renditionId || rendition.resolution === resolution);

  if (type.startsWith("chunk.") && renditionIndex !== -1) {
    const renditions = [...next.renditions];
    const rendition = { ...renditions[renditionIndex], chunks: [...renditions[renditionIndex].chunks] };
    const chunk = chunkFrom(data);
    
    // Exact lookup by chunk_id first, fallback to chunk_index
    let chunkIdx = rendition.chunks.findIndex((item) => item.chunk_id === chunk.chunk_id && chunk.chunk_id !== "undefined");
    if (chunkIdx === -1 && typeof chunk.chunk_index === "number") {
      chunkIdx = rendition.chunks.findIndex((item) => item.chunk_index === chunk.chunk_index);
    }

    if (chunkIdx === -1) {
      rendition.chunks.push(chunk);
    } else {
      const current = rendition.chunks[chunkIdx];
      rendition.chunks[chunkIdx] = {
        ...current,
        ...chunk,
        progress: Math.max(current.progress, chunk.progress),
        ffmpeg: chunk.ffmpeg ?? current.ffmpeg,
      };
    }

    // Chunk completion means transcoding is done; the rendition is only READY
    // after its finalizer publishes rendition.ready.
    rendition.status = chunk.status === "FAILED"
      ? "FAILED"
      : rendition.status === "READY"
        ? "READY"
        : "PROCESSING";
    renditions[renditionIndex] = rendition;
    next = { ...next, renditions };
  }

  if ((type === "rendition.processing" || type === "rendition.ready") && renditionIndex !== -1) {
    const renditions = [...next.renditions];
    renditions[renditionIndex] = {
      ...renditions[renditionIndex],
      status: type === "rendition.ready" ? "READY" : "PROCESSING",
    };
    next = { ...next, renditions };
  }

  return aggregateVideo(next);
}

export function useVideoProcessingEvents(videoId: string, options: UseVideoProcessingEventsOptions = {}) {
  const { enabled = true, onVideoReady, onThumbnailReady } = options;
  const [processingState, setProcessingState] = useState<VideoProcessingState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const onVideoReadyRef = useRef(onVideoReady);
  const onThumbnailReadyRef = useRef(onThumbnailReady);
  const readyNotifiedRef = useRef(false);

  useEffect(() => {
    onVideoReadyRef.current = onVideoReady;
  }, [onVideoReady]);

  useEffect(() => {
    onThumbnailReadyRef.current = onThumbnailReady;
  }, [onThumbnailReady]);

  useEffect(() => {
    if (!videoId || !enabled || videoId.startsWith("vid_demo_")) return;
    readyNotifiedRef.current = false;
    let cancelled = false;
    let source: EventSource | null = null;

    const handlePayload = (data: Record<string, unknown>) => {
      try {
        if (data.type === "ping" || data.type === "keepalive") return;
        const isSnapshot = data.type === "initial.state" || data.type === "snapshot";
        const snapshot = data.type === "snapshot" ? data.snapshot as Record<string, unknown> : data;
        setProcessingState((previous) => isSnapshot ? snapshotFrom(videoId, snapshot) : applyEvent(previous, videoId, data));

        const thumbnailUrl = snapshot.thumbnail_url;
        if (
          (data.type === "thumbnail.ready" || isSnapshot) &&
          typeof thumbnailUrl === "string" &&
          thumbnailUrl
        ) {
          onThumbnailReadyRef.current?.(
            thumbnailUrl,
            Number(snapshot.thumbnail_version ?? 0)
          );
        }

        const videoStatus = String(data.status ?? data.video_status ?? "").toUpperCase();
        const isTerminalSnapshot =
          (data.type === "initial.state" || data.type === "snapshot") &&
          videoStatus === "READY";
        if (data.type === "video.ready" || isTerminalSnapshot) {
          setIsCompleted(true);
          if (!readyNotifiedRef.current) {
            readyNotifiedRef.current = true;
            onVideoReadyRef.current?.();
          }
        } else if (data.type === "video.failed" || videoStatus === "FAILED") {
          setIsFailed(true);
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    const connect = async () => {
      // PostgreSQL snapshot first; Redis/SSE only supplies subsequent live changes.
      try {
        const response = await fetch(`${API_BASE_URL}/api/videos/${videoId}/processing-state`, {
          cache: "no-store",
        });
        if (response.ok && !cancelled) {
          handlePayload(await response.json() as Record<string, unknown>);
        }
      } catch (error) {
        console.error("Error loading processing snapshot:", error);
      }

      if (cancelled) return;
      source = new EventSource(`${API_BASE_URL}/api/videos/${videoId}/events`);
      source.onopen = () => setIsConnected(true);
      source.onmessage = (event) => {
        if (!event.data) return;
        try {
          handlePayload(JSON.parse(event.data) as Record<string, unknown>);
        } catch (error) {
          console.error("Error parsing SSE message:", error);
        }
      };
      source.onerror = () => setIsConnected(false);
    };

    void connect();
    return () => {
      cancelled = true;
      source?.close();
      setIsConnected(false);
    };
  }, [videoId, enabled]);

  return { processingState, isConnected, isCompleted, isFailed };
}
