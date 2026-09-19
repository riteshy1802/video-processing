"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize,
  Settings, 
  AlertCircle,
  Film,
  Check,
  Loader2,
  Gauge
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

import { Rendition } from "@/types/video";

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  deferLoadingUntilPlay?: boolean;
  selectedQuality?: string;
  onQualityChange?: (quality: string) => void;
  onMetadataLoaded?: (metadata: { duration: number; width: number; height: number }) => void;
  renditions?: Rendition[];
  initialDuration?: number;
}

export function VideoPlayer({
  src,
  poster,
  className,
  autoPlay = false,
  deferLoadingUntilPlay = false,
  selectedQuality: externalQuality,
  onQualityChange,
  onMetadataLoaded,
  renditions,
  initialDuration = 0,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hlsPreviewRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(initialDuration || 0);

  useEffect(() => {
    if (initialDuration && initialDuration > 0) {
      setDuration((prev) => (prev > 0 ? prev : initialDuration));
    }
  }, [initialDuration]);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ id: number; height: number; bitrate: number }[]>([]);
  const [internalQuality, setInternalQuality] = useState<string>("auto");
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showPlaybackMenu, setShowPlaybackMenu] = useState(false);
  const qualityMenuRef = useRef<HTMLDivElement | null>(null);
  const playbackMenuRef = useRef<HTMLDivElement | null>(null);
  const wasPlayingRef = useRef<boolean>(false);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const requestedSeekTimeRef = useRef<number | null>(null);
  const playbackEndedRef = useRef(false);
  const playWhenReadyRef = useRef(false);
  const lastAudibleVolumeRef = useRef(1);
  const playbackRateRef = useRef(1);
  const [isLoadRequested, setIsLoadRequested] = useState(
    autoPlay || !deferLoadingUntilPlay
  );

  const currentQuality = externalQuality !== undefined ? externalQuality : internalQuality;

  // Click outside or Escape key to close quality dropdown menu
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        qualityMenuRef.current &&
        !qualityMenuRef.current.contains(event.target as Node)
      ) {
        setShowQualityMenu(false);
      }
      if (
        playbackMenuRef.current &&
        !playbackMenuRef.current.contains(event.target as Node)
      ) {
        setShowPlaybackMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowQualityMenu(false);
        setShowPlaybackMenu(false);
      }
    };

    if (showQualityMenu || showPlaybackMenu) {
      document.addEventListener("pointerdown", handleClickOutside, true);
      document.addEventListener("click", handleClickOutside, true);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside, true);
      document.removeEventListener("click", handleClickOutside, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showQualityMenu, showPlaybackMenu]);

  // Hover frame preview state & non-blocking seek queue
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);
  const [isPreviewSeeking, setIsPreviewSeeking] = useState<boolean>(false);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const isSeekingRef = useRef<boolean>(false);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const QUALITY_OPTIONS = [
    { label: "Auto Quality", value: "auto" },
    { label: "1440p (2K QHD)", value: "1440" },
    { label: "1080p (Full HD)", value: "1080" },
    { label: "720p (HD)", value: "720" },
    { label: "480p (SD)", value: "480" },
    { label: "360p (Low)", value: "360" },
  ];

  const bufferingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearBuffering = () => {
    if (bufferingTimerRef.current) {
      clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
    setIsBuffering(false);
  };

  const currentQualityRef = useRef(currentQuality);
  useEffect(() => {
    currentQualityRef.current = currentQuality;
  }, [currentQuality]);

  const applyQualityLock = (hls: Hls | null, qualityStr: string, levelsArr?: any[]) => {
    if (!hls) {
      console.log("[HLS main] Quality selection ignored: player has not initialized yet.");
      return;
    }
    const cleanVal = qualityStr.replace("p", "");

    if (cleanVal === "auto") {
      console.log("🎬 [HLS Player] Quality selection -> Auto Quality (ABR Mode Enabled)");
      hls.autoLevelCapping = -1;
      hls.nextLevel = -1;
      return;
    }

    const targetHeight = parseInt(cleanVal, 10);
    const searchLevels = (levelsArr && levelsArr.length > 0)
      ? levelsArr
      : (hls.levels && hls.levels.length > 0)
        ? hls.levels
        : [];

    if (searchLevels.length === 0) {
      console.log("[HLS main] Quality selection deferred: master playlist levels are not ready yet.");
      return;
    }

    let matchedIndex = searchLevels.findIndex(
      (lvl: any) => Math.abs((lvl.height || 0) - targetHeight) < 50
    );

    // Fallback: Match by playlist URL pattern (e.g. "360p/index.m3u8")
    if (matchedIndex === -1) {
      matchedIndex = searchLevels.findIndex((lvl: any) =>
        lvl.url?.some((u: string) => u.includes(`${cleanVal}p`))
      );
    }

    if (matchedIndex !== -1) {
      const selectedLvl = searchLevels[matchedIndex];
      console.log(
        `🔒 [HLS Player] Quality Hard-Locked -> Target: ${cleanVal}p | Level Index: ${matchedIndex} | Height: ${selectedLvl?.height || targetHeight}p | Bitrate: ${selectedLvl?.bitrate ? Math.round(selectedLvl.bitrate / 1000) + ' kbps' : 'N/A'}`
      );

      // `nextLevel` keeps the current fragment/buffer playable, then switches
      // to this manually selected rendition at the next safe fragment boundary.
      // It also sets hls.js's manual level, so ABR cannot override the choice.
      hls.autoLevelCapping = -1;
      hls.nextLevel = matchedIndex;
      console.log(
        `[HLS main] Manual quality locked to ${hls.manualLevel} (${selectedLvl?.height ?? targetHeight}p)`
      );
    } else {
      console.warn(`⚠️ [HLS Player] Could not match target resolution ${cleanVal}p in available levels:`, searchLevels);
    }
  };

  // Initialize HLS for main player with resilient network retry
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !isLoadRequested) return;

    setError(null);
    let timelineFrame: number | null = null;

    const stopTimelineUpdates = () => {
      if (timelineFrame !== null) {
        window.cancelAnimationFrame(timelineFrame);
        timelineFrame = null;
      }
    };

    const updateTimelineSmoothly = () => {
      if (
        !video.paused &&
        !video.ended &&
        !video.seeking &&
        requestedSeekTimeRef.current === null
      ) {
        setCurrentTime(video.currentTime);
        timelineFrame = window.requestAnimationFrame(updateTimelineSmoothly);
      } else {
        timelineFrame = null;
      }
    };

    const startTimelineUpdates = () => {
      stopTimelineUpdates();
      timelineFrame = window.requestAnimationFrame(updateTimelineSmoothly);
    };

    const handleWaiting = () => {
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = setTimeout(() => {
        setIsBuffering(true);
      }, 300);
    };

    const handlePlaying = () => {
      playbackEndedRef.current = false;
      video.defaultPlaybackRate = playbackRateRef.current;
      video.playbackRate = playbackRateRef.current;
      if (requestedSeekTimeRef.current === null && !video.seeking) {
        clearBuffering();
      }
      setIsPlaying(true);
      startTimelineUpdates();
    };

    const handleCanPlay = () => {
      if (requestedSeekTimeRef.current === null && !video.seeking) {
        clearBuffering();
      }
    };

    const handlePause = () => {
      stopTimelineUpdates();
      setIsPlaying(false);
    };

    const handleEnded = () => {
      stopTimelineUpdates();
      playbackEndedRef.current = true;
      const finalDuration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : video.currentTime;
      requestedSeekTimeRef.current = null;
      setDuration(finalDuration);
      setCurrentTime(finalDuration);
      setIsPlaying(false);
      clearBuffering();
    };

    const updateTime = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : (initialDuration || 0);
      setDuration(dur);

      if (video.ended || playbackEndedRef.current) {
        setCurrentTime(dur || video.currentTime);
        clearBuffering();
        return;
      }

      const requestedTime = requestedSeekTimeRef.current;
      if (requestedTime === null && !video.seeking) {
        setCurrentTime(video.currentTime);
        clearBuffering();
      } else if (requestedTime !== null) {
        // Do not let an old timeupdate event snap the scrubber back while the
        // requested HLS fragment is still being loaded.
        setCurrentTime(requestedTime);
      }
      if (onMetadataLoaded && (dur > 0 || video.videoWidth > 0)) {
        onMetadataLoaded({
          duration: Math.round(dur),
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };

    const handleSeeking = () => {
      playbackEndedRef.current = false;
      stopTimelineUpdates();
      const requestedTime = requestedSeekTimeRef.current ?? video.currentTime;
      requestedSeekTimeRef.current = requestedTime;
      setCurrentTime(requestedTime);
      setIsBuffering(true);
    };

    const handleSeeked = () => {
      requestedSeekTimeRef.current = null;
      setCurrentTime(video.currentTime);
      clearBuffering();
      if (!video.paused) startTimelineUpdates();
    };

    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("loadedmetadata", updateTime);
    video.addEventListener("seeking", handleSeeking);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // Network Online / Offline handlers
    const startRetryPolling = () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
      retryTimerRef.current = setInterval(() => {
        if (hlsRef.current) {
          hlsRef.current.startLoad();
        }
      }, 3000);
    };

    const stopRetryPolling = () => {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const handleOffline = () => {
      if (video) wasPlayingRef.current = !video.paused;
      setIsBuffering(true);
      startRetryPolling();
    };

    const handleOnline = () => {
      setIsBuffering(true);
      if (hlsRef.current) {
        hlsRef.current.startLoad();
      }
      startRetryPolling();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Prefer hls.js when available. Native HLS owns adaptive-bitrate decisions
    // and exposes no API for this quality selector to lock a rendition.
    if (!Hls.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.defaultPlaybackRate = playbackRateRef.current;
      video.playbackRate = playbackRateRef.current;
      if (autoPlay || playWhenReadyRef.current) {
        playWhenReadyRef.current = false;
        video.play().catch(() => setIsPlaying(false));
      }
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        manifestLoadingMaxRetry: Infinity,
        fragLoadingMaxRetry: Infinity,
        levelLoadingMaxRetry: Infinity,
        fragLoadingRetryDelay: 1000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      const syncLevels = () => {
        if (!hls) return;
        const available = hls.levels || [];
        if (available.length > 0) {
          const parsed = available.map((lvl, idx) => ({
            id: idx,
            height: lvl.height,
            bitrate: lvl.bitrate,
          }));
          setLevels(parsed);
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        video.defaultPlaybackRate = playbackRateRef.current;
        video.playbackRate = playbackRateRef.current;
        const raw = (data.levels && data.levels.length > 0) ? data.levels : (hls.levels || []);
        if (raw.length > 0) {
          const parsed = raw.map((lvl, idx) => ({
            id: idx,
            height: lvl.height,
            bitrate: lvl.bitrate,
          }));
          setLevels(parsed);

          // Lock quality immediately when manifest is parsed
          applyQualityLock(hls, currentQualityRef.current, raw);
        }
        if (autoPlay || playWhenReadyRef.current) {
          playWhenReadyRef.current = false;
          video.play().catch(() => setIsPlaying(false));
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        syncLevels();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const activeLevel = hls.levels[data.level];
        if (activeLevel) {
          console.log(
            `✨ [HLS Player] Stream Level Switched -> Level Index: ${data.level} (${activeLevel.height}p @ ${Math.round(activeLevel.bitrate / 1000)} kbps)`
          );
        }
      });

      hls.on(Hls.Events.FRAG_LOADING, (_event, data) => {
        const level = hls.levels[data.frag.level];
        console.log(
          `[HLS main] Fetching ${level?.height ?? "unknown"}p fragment: ${data.frag.url}`
        );
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        stopRetryPolling();
        if (wasPlayingRef.current && video.paused) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setIsBuffering(true);
            hls.startLoad();
            startRetryPolling();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setError("Stream playback error.");
            hls.destroy();
          }
        }
      });

      return () => {
        if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
        stopTimelineUpdates();
        stopRetryPolling();
        hls.destroy();
        video.removeEventListener("timeupdate", updateTime);
        video.removeEventListener("loadedmetadata", updateTime);
        video.removeEventListener("seeking", handleSeeking);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("playing", handlePlaying);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("ended", handleEnded);
        window.removeEventListener("offline", handleOffline);
        window.removeEventListener("online", handleOnline);
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      };
    }

    return () => {
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      stopTimelineUpdates();
      stopRetryPolling();
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("loadedmetadata", updateTime);
      video.removeEventListener("seeking", handleSeeking);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [src, autoPlay, isLoadRequested]);

  // Handle quality changes with instant level lock & immediate segment fetch
  useEffect(() => {
    applyQualityLock(hlsRef.current, currentQuality, levels);
  }, [currentQuality, levels]);

  // Initialize HLS for preview frame player (locked to 144p level-0 for instant non-blocking seeks, autoStartLoad disabled)
  useEffect(() => {
    const previewVideo = previewVideoRef.current;
    if (!previewVideo || !src || !isLoadRequested) return;

    if (!Hls.isSupported() && previewVideo.canPlayType("application/vnd.apple.mpegurl")) {
      previewVideo.src = src;
    } else if (Hls.isSupported()) {
      const previewHls = new Hls({
        enableWorker: true,
        autoStartLoad: false, // Do not download 480p preview segments unless user hovers over scrubber
        capLevelToPlayerSize: true,
      });
      hlsPreviewRef.current = previewHls;
      previewHls.loadSource(src);
      previewHls.attachMedia(previewVideo);

      previewHls.on(Hls.Events.MANIFEST_PARSED, () => {
        previewHls.currentLevel = 0;
      });

      return () => {
        previewHls.destroy();
      };
    }
  }, [src, isLoadRequested]);

  // Handle queued seeks when preview video finishes seeking
  useEffect(() => {
    const pVideo = previewVideoRef.current;
    if (!pVideo) return;

    const handleSeekComplete = () => {
      setIsPreviewSeeking(false);
      isSeekingRef.current = false;

      // Process pending seek if user moved mouse during active seek
      if (pendingSeekTimeRef.current !== null) {
        const nextTime = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null;
        if (Math.abs(pVideo.currentTime - nextTime) > 0.1) {
          isSeekingRef.current = true;
          setIsPreviewSeeking(true);
          pVideo.currentTime = nextTime;
        }
      }
    };

    pVideo.addEventListener("seeked", handleSeekComplete);
    pVideo.addEventListener("canplay", handleSeekComplete);

    return () => {
      pVideo.removeEventListener("seeked", handleSeekComplete);
      pVideo.removeEventListener("canplay", handleSeekComplete);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!isLoadRequested) {
      playWhenReadyRef.current = true;
      setIsBuffering(true);
      setIsLoadRequested(true);
      return;
    }

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.muted || video.volume === 0) {
      if (video.volume === 0) {
        video.volume = lastAudibleVolumeRef.current;
        setVolume(video.volume);
      }
      video.muted = false;
    } else {
      lastAudibleVolumeRef.current = video.volume;
      video.muted = true;
    }
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const nextVolume = Math.max(0, Math.min(1, Number(e.target.value)));
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    if (nextVolume > 0) lastAudibleVolumeRef.current = nextVolume;
    setVolume(nextVolume);
    setIsMuted(video.muted);
  };

  const handlePlaybackRateChange = (nextRate: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(nextRate)) return;

    playbackRateRef.current = nextRate;
    video.defaultPlaybackRate = nextRate;
    video.playbackRate = nextRate;
    setPlaybackRate(nextRate);
    setShowPlaybackMenu(false);
  };

  const hoverSeekDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const parsedTime = parseFloat(e.target.value);
    if (!Number.isFinite(parsedTime)) return;
    const newTime = Math.max(0, Math.min(parsedTime, video.duration || parsedTime));

    // Keep both the scrubber and the media element at the requested position
    // immediately. The pending ref prevents stale HLS timeupdate events from
    // moving the UI back while the target fragment is being fetched.
    if (Math.abs(video.currentTime - newTime) < 0.05 && !video.seeking) {
      requestedSeekTimeRef.current = null;
      setCurrentTime(newTime);
      clearBuffering();
      return;
    }

    requestedSeekTimeRef.current = newTime;
    setCurrentTime(newTime);
    setIsBuffering(true);
    video.currentTime = newTime;
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch((err) => {
        console.error("Fullscreen error:", err);
      });
    }
  };

  const handleQualitySelect = (val: string) => {
    console.log(`👆 [HLS Player] User selected quality: ${val === "auto" ? "Auto Quality" : val + "p"}`);
    // Apply directly from the click event. This avoids waiting for the parent
    // controlled-state update before disabling ABR on the existing HLS instance.
    applyQualityLock(hlsRef.current, val);
    setInternalQuality(val);
    if (onQualityChange) onQualityChange(val);
    setShowQualityMenu(false);
    setShowPlaybackMenu(false);
  };



  // Scrubber Hover Handler with 60fps Timestamp updates & Non-blocking Video Seek Queue
  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const scrubber = scrubberRef.current;
    if (!scrubber || !duration) return;

    const rect = scrubber.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = offsetX / rect.width;
    const calcTime = percent * duration;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      setHoverPos(offsetX);
      setHoverTime(calcTime);
    });

    // Only attempt live frame preview seeking for HLS (.m3u8) playlists.
    const isHls = src?.includes(".m3u8");
    if (!isHls) return;

    // Debounce hover preview seeks by 100ms so rapid mouse movement does not spam requests
    if (hoverSeekDebounceTimerRef.current) {
      clearTimeout(hoverSeekDebounceTimerRef.current);
    }
    hoverSeekDebounceTimerRef.current = setTimeout(() => {
      if (hlsPreviewRef.current) {
        hlsPreviewRef.current.startLoad();
      }

      const pVideo = previewVideoRef.current;
      if (!pVideo || !isFinite(calcTime)) return;

      if (!isSeekingRef.current) {
        if (Math.abs(pVideo.currentTime - calcTime) > 0.1) {
          isSeekingRef.current = true;
          setIsPreviewSeeking(true);
          pVideo.currentTime = calcTime;
        }
      } else {
        pendingSeekTimeRef.current = calcTime;
      }
    }, 100);
  };


  const handleScrubberMouseLeave = () => {
    if (hoverSeekDebounceTimerRef.current) {
      clearTimeout(hoverSeekDebounceTimerRef.current);
      hoverSeekDebounceTimerRef.current = null;
    }
    setHoverTime(null);
    setIsPreviewSeeking(false);
    isSeekingRef.current = false;
    pendingSeekTimeRef.current = null;
  };

  if (!src) {
    return (
      <div className={cn("aspect-video bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 p-6 font-mono text-xs gap-3 shadow-xs", className)}>
        <Film className="h-8 w-8 text-slate-400 dark:text-slate-600" />
        <span>No video stream URL provided</span>
      </div>
    );
  }

  const progressPercent = duration > 0
    ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
    : 0;

  // Construct quality options from hls.js levels or video renditions prop
  const computedQualityOptions = (() => {
    let list: { label: string; value: string; height: number }[] = [];

    if (levels.length > 0) {
      list = levels
        .filter((l) => l.height > 0)
        .map((l) => ({
          label: `${l.height}p`,
          value: String(l.height),
          height: l.height,
        }));
    } else if (renditions && renditions.length > 0) {
      list = renditions
        .map((r) => {
          const h = parseInt(r.resolution.replace("p", ""), 10);
          return isNaN(h) ? null : { label: `${h}p`, value: String(h), height: h };
        })
        .filter((item): item is { label: string; value: string; height: number } => item !== null);
    }

    const uniqueMap = new Map<number, { label: string; value: string; height: number }>();
    list.forEach((item) => {
      if (!uniqueMap.has(item.height)) {
        uniqueMap.set(item.height, item);
      }
    });

    const sortedList = Array.from(uniqueMap.values()).sort((a, b) => b.height - a.height);

    return [
      { label: "Auto Quality", value: "auto" },
      ...sortedList.map((item) => ({ label: item.label, value: item.value })),
    ];
  })();

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative group aspect-video bg-slate-950 rounded-2xl border border-slate-300 dark:border-slate-800 overflow-hidden shadow-md flex items-center justify-center pointer-events-auto",
        isFullscreen && "w-screen h-screen rounded-none border-none fixed inset-0 z-50",
        className
      )}
    >
      <video
        ref={videoRef}
        poster={poster}
        preload={isLoadRequested ? "auto" : "none"}
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
      />

      {/* Center Big Play / Pause Action Button Overlay */}
      <button
        onClick={togglePlay}
        className={cn(
          "absolute z-20 w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-900/80 border border-slate-700/80 backdrop-blur-md flex items-center justify-center text-white shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-sky-600/90 hover:border-sky-400 cursor-pointer pointer-events-auto",
          !isPlaying
            ? "opacity-100 scale-100"
            : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
        )}
        aria-label={isPlaying ? "Pause Video" : "Play Video"}
      >
        {isPlaying ? (
          <Pause className="h-8 w-8 md:h-10 md:w-10 fill-current text-white" />
        ) : (
          <Play className="h-8 w-8 md:h-10 md:w-10 fill-current text-white ml-1" />
        )}
      </button>

      {/* Centered Buffering Spinner Overlay */}
      {isBuffering && !error && (
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-25 pointer-events-none transition-opacity duration-150">
          <div className="p-3 rounded-full bg-slate-900/80 border border-slate-700/80 shadow-2xl text-sky-400">
            <Loader2 className="h-8 w-8 md:h-10 md:w-10 animate-spin" />
          </div>
          <span className="mt-2 text-xs font-mono text-sky-300 font-medium tracking-wide bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800">
            Buffering HLS stream...
          </span>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-slate-950/90 border border-rose-500/30 flex flex-col items-center justify-center p-6 text-center z-30">
          <AlertCircle className="h-10 w-10 text-rose-400 mb-3" />
          <h4 className="text-slate-100 font-semibold mb-1">Playback Error</h4>
          <p className="text-xs font-mono text-slate-400 max-w-md">{error}</p>
        </div>
      )}

      {/* Controls Bar Overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/95 via-slate-950/75 to-transparent p-4 md:p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-3 z-30 pointer-events-auto">
        
        {/* Scrubber Container with Permanently Mounted Frame Preview Tooltip */}
        <div
          ref={scrubberRef}
          onMouseMove={handleScrubberMouseMove}
          onMouseLeave={handleScrubberMouseLeave}
          className="relative w-full flex items-center group/scrubber cursor-pointer py-2"
        >
          {/* Frame Hover Tooltip Preview Box - Always Mounted for Instant HLS Seeking */}
          <div
            className={cn(
              "absolute bottom-full mb-3 -translate-x-1/2 rounded-xl border border-slate-700/90 bg-slate-900/95 p-1.5 shadow-2xl z-50 flex flex-col items-center gap-1 font-mono text-[11px] text-slate-100 pointer-events-none transition-all duration-150 origin-bottom",
              hoverTime !== null ? "opacity-100 scale-100" : "opacity-0 scale-95"
            )}
            style={{ left: `${hoverPos}px` }}
          >
            {/* Video Frame Preview Container (HLS Only) */}
            {src?.includes(".m3u8") && (
              <div className="w-44 md:w-56 aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center relative shadow-inner">
                <video
                  ref={previewVideoRef}
                  muted
                  playsInline
                  onSeeking={() => setIsPreviewSeeking(true)}
                  onSeeked={() => setIsPreviewSeeking(false)}
                  onCanPlay={() => setIsPreviewSeeking(false)}
                  onLoadedData={() => setIsPreviewSeeking(false)}
                  className={cn(
                    "w-full h-full object-cover transition-opacity duration-150",
                    isPreviewSeeking ? "opacity-40" : "opacity-100"
                  )}
                />

                {/* Subtle loading spinner when seeking frames */}
                {isPreviewSeeking && (
                  <div className="absolute inset-0 bg-slate-950/50 flex items-center justify-center text-sky-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
              </div>
            )}


            {/* Timestamp */}
            <span className="font-bold text-sky-400 text-[11px]">
              {formatDuration(hoverTime || 0)}
            </span>
          </div>

          {/* Sleek Constant Height Progress Bar with Seamless Centered Thumb */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            style={{
              background: `linear-gradient(to right, #0284c7 0%, #38bdf8 ${progressPercent}%, rgba(255, 255, 255, 0.2) ${progressPercent}%, rgba(255, 255, 255, 0.2) 100%)`,
            }}
            className={cn(
              "w-full h-2 rounded-full appearance-none cursor-pointer focus:outline-none shadow-xs",
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5",
              "[&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-sky-400",
              "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white",
              "[&::-webkit-slider-thumb]:shadow-md",
              "[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150",
              "[&::-webkit-slider-thumb]:hover:scale-125",
              "[&::-moz-range-thumb]:appearance-none",
              "[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5",
              "[&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:bg-sky-400",
              "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white",
              "[&::-moz-range-thumb]:shadow-md"
            )}
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            <div className="group/volume flex items-center rounded-lg border border-slate-700/60 bg-slate-900/80 text-slate-200 transition-colors hover:bg-slate-800">
              <button
                type="button"
                onClick={toggleMute}
                className="cursor-pointer p-2"
                title={isMuted || volume === 0 ? "Unmute" : "Mute"}
                aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>

              <div className="w-0 overflow-hidden opacity-0 transition-[width,opacity,padding] duration-200 group-hover/volume:w-24 group-hover/volume:pr-3 group-hover/volume:opacity-100">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                  title={`Volume ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                  style={{
                    background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${(isMuted ? 0 : volume) * 100}%, rgba(148, 163, 184, 0.35) ${(isMuted ? 0 : volume) * 100}%, rgba(148, 163, 184, 0.35) 100%)`,
                  }}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full focus:outline-none [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400"
                />
              </div>
            </div>

            {/* Time Display */}
            <span className="text-xs font-mono text-slate-200 font-medium">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2 relative">
            <div ref={playbackMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowPlaybackMenu((current) => !current);
                  setShowQualityMenu(false);
                }}
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 font-mono text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                title="Playback speed"
                aria-haspopup="menu"
                aria-expanded={showPlaybackMenu}
              >
                <Gauge className="h-3.5 w-3.5 text-sky-400" />
                <span>{playbackRate}×</span>
              </button>

              {showPlaybackMenu && (
                <div className="absolute bottom-full right-0 z-50 mb-2 w-36 rounded-xl border border-slate-700 bg-slate-900 p-1.5 font-mono text-xs text-slate-200 shadow-xl">
                  <div className="mb-1 border-b border-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Playback Speed
                  </div>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-slate-800",
                        playbackRate === rate && "bg-sky-500/10 font-semibold text-sky-400"
                      )}
                    >
                      <span>{rate}×</span>
                      {playbackRate === rate && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quality Menu Popover */}
            <div ref={qualityMenuRef} className="relative">
              <button
                onClick={() => {
                  setShowQualityMenu(!showQualityMenu);
                  setShowPlaybackMenu(false);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:bg-slate-800 text-slate-200 font-mono text-xs transition-colors cursor-pointer"
              >
                <Settings className="h-3.5 w-3.5 text-sky-400" />
                <span className="capitalize">{currentQuality === "auto" ? "Auto Quality" : `${currentQuality}p`}</span>
              </button>

              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-44 rounded-xl bg-slate-900 border border-slate-700 p-1.5 shadow-xl font-mono text-xs text-slate-200 z-50">
                  <div className="px-2 py-1 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1 font-semibold">
                    Streaming Quality
                  </div>
                  {computedQualityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleQualitySelect(opt.value)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-slate-800 transition-colors cursor-pointer",
                        (currentQuality.replace("p", "") === opt.value.replace("p", "") || (currentQuality === "auto" && opt.value === "auto")) && "text-sky-400 bg-sky-500/10 font-semibold"
                      )}
                    >
                      <span>{opt.label}</span>
                      {(currentQuality.replace("p", "") === opt.value.replace("p", "") || (currentQuality === "auto" && opt.value === "auto")) && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Toggle Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
