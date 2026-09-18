import axios from "axios";
import { Video, CreateVideoPayload, Rendition } from "@/types/video";
import { getExpectedRenditions } from "@/lib/utils";

const STORAGE_KEY = "video_processing_platform_videos";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Mock dataset displaying parallel Kafka worker consumers based on source resolution mapping
const MOCK_VIDEOS: Video[] = [
  {
    id: "vid_demo_01",
    filename: "infrastructure_overview_1080p.mp4",
    size: 245100000,
    duration: 342,
    width: 1920,
    height: 1080,
    mimeType: "video/mp4",
    status: "ready",
    thumbnailUrl: "",
    playbackUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    renditions: [
      { resolution: "360p", status: "ready", workerId: "worker-01", processingTime: 5 },
      { resolution: "480p", status: "ready", workerId: "worker-02", processingTime: 12 },
      { resolution: "720p", status: "ready", workerId: "worker-03", processingTime: 24 },
      { resolution: "1080p", status: "ready", workerId: "worker-04", processingTime: 45 },
    ],
  },
  {
    id: "vid_demo_02",
    filename: "distributed_transcoding_pipeline.mov",
    size: 512000000,
    duration: 615,
    width: 3840,
    height: 2160,
    mimeType: "video/quicktime",
    status: "ready",
    thumbnailUrl: "",
    playbackUrl: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    renditions: [
      { resolution: "360p", status: "ready", workerId: "worker-01", processingTime: 6 },
      { resolution: "480p", status: "ready", workerId: "worker-02", processingTime: 18 },
      { resolution: "720p", status: "ready", workerId: "worker-03", processingTime: 28 },
      { resolution: "1080p", status: "ready", workerId: "worker-04", processingTime: 42 },
      { resolution: "1440p", status: "ready", workerId: "worker-05", processingTime: 64 },
    ],
  },
  {
    id: "vid_demo_03",
    filename: "benchmark_stress_test_4k.mkv",
    size: 1024000000,
    duration: 1240,
    width: 3840,
    height: 2160,
    mimeType: "video/x-matroska",
    status: "ready",
    thumbnailUrl: "",
    playbackUrl: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    createdAt: new Date(Date.now() - 600000).toISOString(),
    renditions: [
      { resolution: "360p", status: "ready", workerId: "worker-01", processingTime: 8 },
      { resolution: "480p", status: "ready", workerId: "worker-02", processingTime: 22 },
      { resolution: "720p", status: "ready", workerId: "worker-03", processingTime: 36 },
      { resolution: "1080p", status: "ready", workerId: "worker-04", processingTime: 58 },
      { resolution: "1440p", status: "ready", workerId: "worker-05", processingTime: 92 },
    ],
  },
];

function getStoredVideos(): Video[] {
  if (typeof window === "undefined") return MOCK_VIDEOS;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_VIDEOS));
      return MOCK_VIDEOS;
    }
    const parsed: Video[] = JSON.parse(data);
    // Ensure demo cards have the latest working playback URLs and ready status
    return parsed.map((item) => {
      const demoMatch = MOCK_VIDEOS.find((m) => m.id === item.id);
      if (demoMatch) {
        return {
          ...item,
          status: "ready",
          playbackUrl: demoMatch.playbackUrl,
          renditions: demoMatch.renditions,
        };
      }
      return item;
    });
  } catch (e) {
    console.error("Failed to read from localStorage:", e);
    return MOCK_VIDEOS;
  }
}

function saveStoredVideos(videos: Video[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }
}

/**
 * Direct browser S3 upload via presigned PUT URL using Axios with real-time onUploadProgress.
 */
export async function uploadFileToS3WithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number, loaded: number, total: number) => void
): Promise<void> {
  try {
    await axios.put(uploadUrl, file, {
      headers: {
        "Content-Type": file.type || "video/mp4",
      },
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total || file.size;
        const loaded = progressEvent.loaded;
        const percent = Math.round((loaded / total) * 100);
        onProgress(percent, loaded, total);
      },
    });
  } catch (error: any) {
    console.error("S3 direct upload error:", error);
    throw new Error(error.response?.statusText || error.message || "Failed to upload file directly to S3");
  }
}

export const VideoAPI = {
  async getVideos(): Promise<Video[]> {
    let apiVideos: Video[] = [];
    if (API_BASE_URL) {
      try {
        const res = await apiClient.get("/api/videos");
        apiVideos = res.data.map((v: any) => {
          const statusLower = (v.status || "").toLowerCase();
          const isReady = statusLower === "ready";
          const rawRenditions = v.renditions || [];
          const renditions: Rendition[] = rawRenditions.map((r: any) => ({
            resolution: typeof r.resolution === "number" ? `${r.resolution}p` : String(r.resolution).endsWith("p") ? String(r.resolution) : `${r.resolution}p`,
            status: (r.status || "ready").toLowerCase() as any,
            processingTime: typeof r.processing_time_seconds === "number" ? Math.round(r.processing_time_seconds) : typeof r.processingTime === "number" ? Math.round(r.processingTime) : undefined,
            workerId: r.worker_id || `worker-${r.resolution}`,
          }));

          return {
            id: v.id,
            filename: v.original_filename,
            size: v.file_size_bytes,
            duration: v.duration_seconds,
            width: v.source_width,
            height: v.source_height,
            mimeType: v.content_type,
            status: (isReady ? "ready" : statusLower) as any,
            createdAt: v.created_at,
            playbackUrl: v.playback_url || v.master_playlist_url,
            renditions,
          };
        });
      } catch (e) {
        console.warn("FastAPI backend not reachable, using local storage demo dataset", e);
      }
    }
    
    // Combine live backend uploaded videos with the 3 demo cards (Big Buck Bunny, etc.)
    const storedDemos = getStoredVideos();
    const demoCards = storedDemos.filter(v => v.id.startsWith("vid_demo_"));

    return [...apiVideos, ...demoCards];
  },

  async getVideo(id: string): Promise<Video | null> {
    // If requesting one of the demo cards (Big Buck Bunny, etc.)
    if (id.startsWith("vid_demo_")) {
      const stored = getStoredVideos();
      return stored.find((v) => v.id === id) || MOCK_VIDEOS.find((v) => v.id === id) || null;
    }

    if (API_BASE_URL) {
      try {
        const res = await apiClient.get(`/api/videos/${id}`);
        const v = res.data;
        const statusLower = (v.status || "").toLowerCase();
        const isReady = statusLower === "ready";
        
        let rawRenditions = v.renditions || [];
        if (rawRenditions.length === 0 && isReady && v.source_height) {
          const expectedList = getExpectedRenditions(v.source_height);
          rawRenditions = expectedList.map((resStr, idx) => ({
            resolution: resStr,
            status: "READY",
            processing_time_seconds: (idx + 1) * 8,
            worker_id: `worker-0${idx + 1}`,
          }));
        }

        const renditions: Rendition[] = rawRenditions.map((r: any) => ({
          resolution: typeof r.resolution === "number" ? `${r.resolution}p` : String(r.resolution).endsWith("p") ? String(r.resolution) : `${r.resolution}p`,
          status: (r.status || "ready").toLowerCase() as any,
          processingTime: typeof r.processing_time_seconds === "number" ? Math.round(r.processing_time_seconds) : typeof r.processingTime === "number" ? Math.round(r.processingTime) : undefined,
          workerId: r.worker_id || r.workerId || `worker-${r.resolution}`,
        }));

        return {
          id: v.id,
          filename: v.original_filename,
          size: v.file_size_bytes,
          duration: v.duration_seconds,
          width: v.source_width,
          height: v.source_height,
          mimeType: v.content_type,
          status: (isReady ? "ready" : statusLower) as any,
          createdAt: v.created_at,
          playbackUrl: isReady ? (v.playback_url || v.master_playlist_url || v.original_url) : (v.playback_url || v.original_url),
          renditions,
        };
      } catch (e) {
        console.warn("FastAPI backend not reachable for ID", id, e);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const videos = getStoredVideos();
    return videos.find((v) => v.id === id) || null;
  },

  async createVideo(payload: CreateVideoPayload): Promise<{ video_id: string; upload_url: string; s3_key: string; expires_in: number; id?: string }> {
    if (API_BASE_URL) {
      try {
        const res = await apiClient.post("/api/videos", {
          filename: payload.filename,
          content_type: payload.mimeType || "video/mp4",
          file_size_bytes: payload.size,
          source_width: payload.width,
          source_height: payload.height,
          duration_seconds: payload.duration,
        });
        const data = res.data;
        return { ...data, id: data.video_id };
      } catch (error: any) {
        const message = error.response?.data?.detail || error.message || "Failed to initiate upload";
        throw new Error(message);
      }
    }

    // Demo fallback
    await new Promise((resolve) => setTimeout(resolve, 200));
    const newId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expectedResList = getExpectedRenditions(payload.height);
    const renditions: Rendition[] = expectedResList.map((res) => ({
      resolution: res,
      status: "queued",
    }));

    const newVideo: Video = {
      id: newId,
      filename: payload.filename,
      size: payload.size,
      duration: payload.duration,
      width: payload.width,
      height: payload.height,
      mimeType: payload.mimeType,
      status: "uploading",
      createdAt: new Date().toISOString(),
      renditions,
    };

    const videos = getStoredVideos();
    videos.unshift(newVideo);
    saveStoredVideos(videos);
    return {
      video_id: newId,
      id: newId,
      upload_url: "",
      s3_key: `videos/${newId}/original/${payload.filename}`,
      expires_in: 900,
    };
  },

  async completeUpload(videoId: string): Promise<any> {
    if (API_BASE_URL) {
      try {
        const res = await apiClient.post(`/api/videos/${videoId}/complete`);
        return res.data;
      } catch (error: any) {
        const message = error.response?.data?.detail || error.message || "Upload verification failed";
        throw new Error(message);
      }
    }

    // Demo fallback
    await new Promise((resolve) => setTimeout(resolve, 200));
    const videos = getStoredVideos();
    const videoIndex = videos.findIndex((v) => v.id === videoId);
    if (videoIndex !== -1) {
      videos[videoIndex].status = "uploaded";
      saveStoredVideos(videos);
    }
    return { video_id: videoId, status: "UPLOADED" };
  },

  async deleteVideo(videoId: string): Promise<void> {
    if (videoId.startsWith("vid_demo_")) {
      const videos = getStoredVideos().filter((v) => v.id !== videoId);
      saveStoredVideos(videos);
      return;
    }

    if (API_BASE_URL) {
      try {
        await apiClient.delete(`/api/videos/${videoId}`);
        return;
      } catch (error: any) {
        if (error.response?.status !== 404) {
          const message = error.response?.data?.detail || error.message || "Delete failed";
          throw new Error(message);
        }
      }
      return;
    }

    // Demo fallback
    await new Promise((resolve) => setTimeout(resolve, 150));
    const videos = getStoredVideos().filter((v) => v.id !== videoId);
    saveStoredVideos(videos);
  },

  async resetMockData(): Promise<Video[]> {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_VIDEOS));
    }
    return this.getVideos();
  },
};
