import { Video, CreateVideoPayload, Rendition } from "@/types/video";

const STORAGE_KEY = "video_processing_platform_videos";

// Mock dataset displaying parallel Kafka worker consumers
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
      { resolution: "144p", status: "ready", workerId: "worker-01", processingTime: 5 },
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
    status: "processing",
    thumbnailUrl: "",
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    renditions: [
      { resolution: "144p", status: "ready", workerId: "worker-01", processingTime: 6 },
      { resolution: "480p", status: "ready", workerId: "worker-02", processingTime: 18 },
      { resolution: "720p", status: "processing", workerId: "worker-03" },
      { resolution: "1080p", status: "processing", workerId: "worker-04" },
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
    status: "queued",
    thumbnailUrl: "",
    createdAt: new Date(Date.now() - 600000).toISOString(),
    renditions: [
      { resolution: "144p", status: "queued" },
      { resolution: "480p", status: "queued" },
      { resolution: "720p", status: "queued" },
      { resolution: "1080p", status: "queued" },
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
    return JSON.parse(data);
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

const activeSimulations = new Set<string>();

function runSimulatedTranscoding(videoId: string) {
  if (activeSimulations.has(videoId)) return;
  activeSimulations.add(videoId);

  let step = 0;
  const interval = setInterval(() => {
    const videos = getStoredVideos();
    const videoIndex = videos.findIndex((v) => v.id === videoId);
    if (videoIndex === -1) {
      clearInterval(interval);
      activeSimulations.delete(videoId);
      return;
    }

    const video = { ...videos[videoIndex] };

    step++;
    if (step === 1) {
      // Parallel Kafka consumer worker allocation: 144p & 480p processing concurrently
      video.status = "processing";
      video.renditions = video.renditions.map((r) => {
        if (r.resolution === "144p") return { ...r, status: "processing", workerId: "worker-01" };
        if (r.resolution === "480p") return { ...r, status: "processing", workerId: "worker-02" };
        return r;
      });
    } else if (step === 3) {
      // 144p & 480p completed, 720p & 1080p processing concurrently on worker-03 and worker-04
      video.renditions = video.renditions.map((r) => {
        if (r.resolution === "144p") return { ...r, status: "ready", workerId: "worker-01", processingTime: 5 };
        if (r.resolution === "480p") return { ...r, status: "ready", workerId: "worker-02", processingTime: 12 };
        if (r.resolution === "720p") return { ...r, status: "processing", workerId: "worker-03" };
        if (r.resolution === "1080p") return { ...r, status: "processing", workerId: "worker-04" };
        return r;
      });
    } else if (step === 6) {
      // All parallel worker jobs completed
      video.renditions = video.renditions.map((r) => {
        if (r.resolution === "720p") return { ...r, status: "ready", workerId: "worker-03", processingTime: 22 };
        if (r.resolution === "1080p") return { ...r, status: "ready", workerId: "worker-04", processingTime: 38 };
        return r;
      });
      video.status = "ready";
      video.playbackUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
      
      clearInterval(interval);
      activeSimulations.delete(videoId);
    }

    videos[videoIndex] = video;
    saveStoredVideos(videos);
  }, 2000);
}

export const VideoAPI = {
  async getVideos(): Promise<Video[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return getStoredVideos();
  },

  async getVideo(id: string): Promise<Video | null> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const videos = getStoredVideos();
    const found = videos.find((v) => v.id === id);
    if (found && (found.status === "queued" || found.status === "processing")) {
      runSimulatedTranscoding(found.id);
    }
    return found || null;
  },

  async createVideo(payload: CreateVideoPayload): Promise<Video> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const newId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    const renditions: Rendition[] = [
      { resolution: "144p", status: "queued" },
      { resolution: "480p", status: "queued" },
      { resolution: "720p", status: "queued" },
      { resolution: "1080p", status: "queued" },
    ];

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
    return newVideo;
  },

  async requestUploadUrl(videoId: string, filename: string): Promise<{ uploadUrl: string; key: string }> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return {
      uploadUrl: `${apiBase}/api/v1/s3-upload-presigned/${videoId}?file=${encodeURIComponent(filename)}`,
      key: `raw/${videoId}/${filename}`,
    };
  },

  async completeUpload(videoId: string): Promise<Video> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const videos = getStoredVideos();
    const videoIndex = videos.findIndex((v) => v.id === videoId);
    
    if (videoIndex === -1) {
      throw new Error("Video not found");
    }

    const video = { ...videos[videoIndex] };
    video.status = "queued";
    video.updatedAt = new Date().toISOString();

    videos[videoIndex] = video;
    saveStoredVideos(videos);

    runSimulatedTranscoding(videoId);

    return video;
  },

  async deleteVideo(videoId: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const videos = getStoredVideos().filter((v) => v.id !== videoId);
    saveStoredVideos(videos);
  },

  async resetMockData(): Promise<Video[]> {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_VIDEOS));
    }
    return MOCK_VIDEOS;
  }
};
