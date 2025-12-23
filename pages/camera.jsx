import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Play, Pause, SkipBack, SkipForward, FolderOpen, Video, Clock, Eye, EyeOff, FastForward, Loader2, AlertCircle, Image as ImageIcon, RotateCcw, MapPin, ChevronLeft, Camera } from 'lucide-react';
import { CAMERA_SETTINGS, CAMERA_INDEX_MAP, PLAYBACK_RATES, DEFAULT_CLIP_DURATION } from '../utils/camera/constants';
import { formatDuration, parseTeslaTimestamp, getReasonLabel, getVideoDuration, formatFullTimestamp, formatEventTimeRange } from '../utils/camera/helpers';
import Tooltip from '../components/Tooltip';

// --- Component ---

export default function TeslaSentryViewer() {
  // 1. State Declarations
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [readStatus, setReadStatus] = useState({});
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [clipDurations, setClipDurations] = useState([]);
  const [analyzingDurations, setAnalyzingDurations] = useState(false);
  const [autoSeekPending, setAutoSeekPending] = useState(false);

  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [mainCamera, setMainCamera] = useState('front');
  const [isBuffering, setIsBuffering] = useState(false);

  const [localTime, setLocalTime] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);

  const [showMobileList, setShowMobileList] = useState(true);

  const [activeVideoUrls, setActiveVideoUrls] = useState({});
  const [mainCameraReady, setMainCameraReady] = useState(false);

  // 2. Refs
  const fileInputRef = useRef(null);
  const videoRefs = useRef({});
  const animationFrameRef = useRef(null);
  const blobCacheRef = useRef({});
  const isPlayingRef = useRef(false);
  const stallCountersRef = useRef({});

  // 3. Initialization Effects
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedStatus = localStorage.getItem('tesla_sentry_read_status');
      if (savedStatus) {
        try { setReadStatus(JSON.parse(savedStatus)); } catch (e) { console.error(e); }
      }

      const savedRate = localStorage.getItem('tesla_sentry_playback_rate');
      if (savedRate) {
        setPlaybackRate(parseFloat(savedRate));
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tesla_sentry_playback_rate', playbackRate);
    }
  }, [playbackRate]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!isPlaying) stallCountersRef.current = {};
  }, [isPlaying]);

  // 4. Derived Data (Only one declaration for each symbol)
  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId), [events, selectedEventId]);

  const currentClip = useMemo(() => {
    if (!selectedEvent || !selectedEvent.clips) return null;
    return selectedEvent.clips[currentClipIndex];
  }, [selectedEvent, currentClipIndex]);

  const clipStartTimes = useMemo(() => {
    let sum = 0;
    return clipDurations.map(d => {
      const start = sum;
      sum += d;
      return start;
    });
  }, [clipDurations]);

  const totalEventDuration = useMemo(() => {
    return clipDurations.reduce((a, b) => a + b, 0);
  }, [clipDurations]);

  const eventTriggerTimeOffset = useMemo(() => {
    if (!selectedEvent || !selectedEvent.metadata || !selectedEvent.metadata.timestamp || selectedEvent.clips.length === 0 || clipDurations.length === 0) return null;

    try {
      const triggerDate = new Date(selectedEvent.metadata.timestamp);

      for (let i = 0; i < selectedEvent.clips.length; i++) {
        const clip = selectedEvent.clips[i];
        const clipStartDate = parseTeslaTimestamp(clip.date, clip.time);
        const duration = clipDurations[i] || DEFAULT_CLIP_DURATION;

        const diffInClip = (triggerDate - clipStartDate) / 1000;

        if (diffInClip >= 0 && diffInClip <= duration + 1) {
          const clipGlobalStart = clipStartTimes[i];
          return clipGlobalStart + diffInClip;
        }
      }
    } catch (e) {
      console.error("Error calculating red dot", e);
    }
    return null;
  }, [selectedEvent, clipDurations, clipStartTimes]);

  const currentRealTimeDisplay = useMemo(() => {
    if (!currentClip) return "--/-- --:--:--";
    const startDate = parseTeslaTimestamp(currentClip.date, currentClip.time);
    startDate.setSeconds(startDate.getSeconds() + localTime);
    return startDate.toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(/\//g, '/').replace(' ', ' ');
  }, [currentClip, localTime]);

  const sortedViews = useMemo(() => {
    const keys = Object.keys(CAMERA_SETTINGS);
    return keys.sort((a, b) => CAMERA_SETTINGS[a].sortView - CAMERA_SETTINGS[b].sortView);
  }, []);

  // 5. Duration Analysis Effect
  useEffect(() => {
    if (!selectedEvent) {
      setClipDurations([]);
      return;
    }

    const analyze = async () => {
      setAnalyzingDurations(true);

      const promises = selectedEvent.clips.map(async (clip) => {
        const file = clip.videos['front'] || Object.values(clip.videos)[0];
        if (!file) return DEFAULT_CLIP_DURATION;
        return await getVideoDuration(file);
      });

      try {
        const realDurations = await Promise.all(promises);
        setClipDurations(realDurations);
      } catch (e) {
        console.error("Error analyzing durations", e);
      } finally {
        setAnalyzingDurations(false);
      }
    };

    analyze();
  }, [selectedEvent]);

  // 6. Auto Seek Effect (Moved UP)
  useEffect(() => {
    if (autoSeekPending && !analyzingDurations && clipDurations.length > 0) {
      if (eventTriggerTimeOffset !== null) {
        const targetTime = Math.max(0, eventTriggerTimeOffset - 60);
        applyGlobalSeek(targetTime);
      }
      setAutoSeekPending(false);
    }
  }, [autoSeekPending, analyzingDurations, clipDurations, eventTriggerTimeOffset]);

  // 7. Seek & Control Callbacks
  const applyGlobalSeek = useCallback((targetTime) => {
    if (isNaN(targetTime)) return;

    let newClipIndex = 0;
    let newLocalTime = 0;

    for (let i = 0; i < clipStartTimes.length; i++) {
      const start = clipStartTimes[i];
      const duration = clipDurations[i];

      if (targetTime >= start && targetTime < start + duration) {
        newClipIndex = i;
        newLocalTime = targetTime - start;
        break;
      }

      if (i === clipStartTimes.length - 1 && targetTime >= start) {
        newClipIndex = i;
        newLocalTime = Math.min(targetTime - start, duration - 0.1);
      }
    }

    setGlobalTime(targetTime);
    setLocalTime(newLocalTime);
    stallCountersRef.current = {};

    if (newClipIndex !== currentClipIndex) {
      setCurrentClipIndex(newClipIndex);
    } else {
      Object.values(videoRefs.current).forEach(v => {
        if (v && v.readyState > 0) v.currentTime = newLocalTime;
      });
    }
  }, [clipStartTimes, clipDurations, currentClipIndex]);

  // Re-attach Auto Seek Effect here now that applyGlobalSeek is defined
  useEffect(() => {
    if (autoSeekPending && !analyzingDurations && clipDurations.length > 0) {
      if (eventTriggerTimeOffset !== null) {
        const targetTime = Math.max(0, eventTriggerTimeOffset - 60);
        applyGlobalSeek(targetTime);
      }
      setAutoSeekPending(false);
    }
  }, [autoSeekPending, analyzingDurations, clipDurations, eventTriggerTimeOffset, applyGlobalSeek]);

  const handleSeekStart = () => {
    setIsSeeking(true);
    setIsPlaying(false);
    Object.values(videoRefs.current).forEach(v => { if (v) v.pause(); });
  };

  const handleGlobalSeek = (e) => {
    const val = parseFloat(e.target.value);
    applyGlobalSeek(val);
  };

  const handleSeekEnd = () => {
    setIsSeeking(false);
    setTimeout(() => {
      setIsPlaying(true);
    }, 250);
  };

  const resetToStart = () => {
    setIsPlaying(false);
    Object.values(videoRefs.current).forEach(v => { if (v) v.pause(); });
    applyGlobalSeek(0);
    setTimeout(() => {
      setIsPlaying(true);
    }, 250);
  };

  // --- Snapshot Logic ---
  const handleSnapshot = useCallback(() => {
    if (!selectedEvent || !currentClip) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const activeKeys = Object.keys(CAMERA_SETTINGS).filter(key => key !== 'inside' && currentClip.videos[key] && videoRefs.current[key]);

    activeKeys.sort((a, b) => (CAMERA_SETTINGS[a]?.sort ?? 99) - (CAMERA_SETTINGS[b]?.sort ?? 99));

    if (activeKeys.length === 0) return;

    const baseVideo = videoRefs.current[activeKeys[0]];
    const w = baseVideo.videoWidth || 1280;
    const h = baseVideo.videoHeight || 960;

    const cols = 2;
    const rows = Math.ceil(activeKeys.length / cols);

    canvas.width = w * cols;
    canvas.height = h * rows;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    activeKeys.forEach((key, index) => {
      const video = videoRefs.current[key];
      const setting = CAMERA_SETTINGS[key];
      const col = index % cols;
      const row = Math.floor(index / cols);
      const baseX = col * w; // Simple grid layout
      const baseY = row * h;

      // 1. Draw Video (with contain logic)
      if (video && video.readyState >= 2) {
        const srcW = video.videoWidth;
        const srcH = video.videoHeight;

        const scaleW = w / srcW;
        const scaleH = h / srcH;
        const scale = Math.min(scaleW, scaleH);

        const drawW = srcW * scale;
        const drawH = srcH * scale;

        const offsetX = (w - drawW) / 2;
        const offsetY = (h - drawH) / 2;

        const drawX = baseX + offsetX;
        const drawY = baseY + offsetY;

        ctx.save();

        if (setting.mirror) {
          ctx.translate(baseX + w / 2, baseY + h / 2);
          ctx.scale(-1, 1);
          ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
          ctx.drawImage(video, drawX, drawY, drawW, drawH);
        }
        ctx.restore();
      }

      // 2. Draw Camera Label 
      ctx.save();
      ctx.font = 'bold 32px monospace';
      ctx.fillStyle = 'white';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.textBaseline = 'top';

      ctx.textAlign = col === 0 ? 'left' : 'right';
      const labelX = col === 0 ? baseX + 20 : baseX + w - 20;

      ctx.fillText(setting.name, labelX, baseY + 20);
      ctx.restore();
    });

    // Watermark
    const { city, street, est_lat, est_lon } = selectedEvent.metadata || {};
    const locationText = `${city || ''}${street || ''}`.trim();
    const gpsText = (est_lat && est_lon) ? `（${Number(est_lat).toFixed(5)}, ${Number(est_lon).toFixed(5)}）` : '';

    let timeText = '';
    let fileNameTimestamp = '';

    if (currentClip) {
      const startDate = parseTeslaTimestamp(currentClip.date, currentClip.time);
      startDate.setSeconds(startDate.getSeconds() + localTime);
      const yyyy = startDate.getFullYear();
      const MM = String(startDate.getMonth() + 1).padStart(2, '0');
      const dd = String(startDate.getDate()).padStart(2, '0');
      const HH = String(startDate.getHours()).padStart(2, '0');
      const mm = String(startDate.getMinutes()).padStart(2, '0');
      const ss = String(startDate.getSeconds()).padStart(2, '0');

      timeText = `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
      fileNameTimestamp = `${yyyy}-${MM}-${dd}_${HH}-${mm}-${ss}`;
    }

    const watermarkText = `${timeText}　${locationText}${gpsText}`;

    // Draw Watermark Text (Left-Align, with padding)
    ctx.save();
    ctx.font = 'bold 32px monospace';
    ctx.fillStyle = 'white';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Position: Top-Left with 100px padding to avoid camera label
    ctx.textAlign = 'left';
    ctx.fillText(watermarkText, 100, 20);
    ctx.restore();

    const fileName = `${fileNameTimestamp}_${locationText || 'TeslaCam'}.png`;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();

  }, [selectedEvent, currentClip, localTime]);

  // --- Blob Management ---

  const loadClipBlobs = useCallback((event, index) => {
    if (!event || !event.clips[index]) return null;
    if (blobCacheRef.current[index]) return blobCacheRef.current[index];

    const clip = event.clips[index];
    const urls = {};
    Object.keys(clip.videos).forEach(camera => {
      urls[camera] = URL.createObjectURL(clip.videos[camera]);
    });

    blobCacheRef.current[index] = urls;
    return urls;
  }, []);

  const unloadClipBlobs = useCallback((index) => {
    if (blobCacheRef.current[index]) {
      Object.values(blobCacheRef.current[index]).forEach(url => URL.revokeObjectURL(url));
      delete blobCacheRef.current[index];
    }
  }, []);

  useEffect(() => {
    if (!selectedEvent || !selectedEvent.clips[currentClipIndex]) return;
    const clip = selectedEvent.clips[currentClipIndex];

    if (clip.videos && !clip.videos[mainCamera]) {
      const available = Object.keys(clip.videos);
      if (available.length > 0) {
        available.sort((a, b) => {
          const sortA = CAMERA_SETTINGS[a]?.sort ?? 99;
          const sortB = CAMERA_SETTINGS[b]?.sort ?? 99;
          return sortA - sortB;
        });

        const nextCam = available[0];
        setMainCamera(nextCam);
      }
    }
  }, [currentClipIndex, selectedEvent, mainCamera]);

  useEffect(() => {
    if (!selectedEventId) return;
    const evt = events.find(e => e.id === selectedEventId);
    if (!evt) return;

    const clip = evt.clips[currentClipIndex];
    let effectiveMaster = 'front';
    if (clip) {
      if (clip.videos[mainCamera]) effectiveMaster = mainCamera;
      else if (clip.videos['front']) effectiveMaster = 'front';
      else effectiveMaster = Object.keys(clip.videos)[0];
    }

    if (clip && clip.videos && clip.videos[effectiveMaster]) {
      setIsBuffering(true);
      setMainCameraReady(false);
    } else {
      setIsBuffering(false);
      setMainCameraReady(true);
    }

    const currentUrls = loadClipBlobs(evt, currentClipIndex);
    setActiveVideoUrls(currentUrls || {});

    if (currentClipIndex < evt.clips.length - 1) {
      loadClipBlobs(evt, currentClipIndex + 1);
    }

    if (currentClipIndex >= 2) {
      unloadClipBlobs(currentClipIndex - 2);
    }

  }, [currentClipIndex, selectedEventId, events, loadClipBlobs, unloadClipBlobs, mainCamera]);

  useEffect(() => {
    if (!selectedEventId) return;
    const evt = events.find(e => e.id === selectedEventId);
    if (!evt) return;

    const currentDuration = clipDurations[currentClipIndex] || DEFAULT_CLIP_DURATION;

    if (localTime > currentDuration - 10) {
      const nextIndex = currentClipIndex + 1;
      if (nextIndex < evt.clips.length && !blobCacheRef.current[nextIndex]) {
        loadClipBlobs(evt, nextIndex);
      }
    }
  }, [localTime, currentClipIndex, selectedEventId, events, loadClipBlobs, clipDurations]);

  useEffect(() => {
    return () => {
      Object.keys(blobCacheRef.current).forEach(idx => unloadClipBlobs(idx));
    };
  }, [selectedEventId, unloadClipBlobs]);


  // --- Player Core Functions ---

  const safePlay = (videoElement) => {
    if (!videoElement) return;
    const promise = videoElement.play();
    if (promise !== undefined) {
      promise.catch(error => {
        if (error.name !== 'AbortError' && !error.message.includes('interrupted')) {
          // console.warn("Video play error:", error);
        }
      });
    }
  };

  useEffect(() => {
    Object.values(videoRefs.current).forEach(v => {
      if (v) v.playbackRate = playbackRate;
    });
  }, [playbackRate, activeVideoUrls, mainCameraReady]);

  const getMasterCamera = () => {
    if (!currentClip) return 'front';
    if (currentClip.videos[mainCamera]) return mainCamera;
    if (currentClip.videos['front']) return 'front';
    return Object.keys(currentClip.videos)[0];
  };

  const handleVideoLoad = (e, camera) => {
    const vid = e.target;
    if (Math.abs(vid.currentTime - localTime) > 0.5) {
      vid.currentTime = localTime;
    }

    const masterCam = getMasterCamera();

    if (camera === masterCam) {
      setMainCameraReady(true);
      setIsBuffering(false);
    }
  };

  const syncLoop = () => {
    if (isBuffering) return;

    const masterCam = getMasterCamera();
    const masterVideo = videoRefs.current[masterCam];

    if (!isSeeking && masterVideo && !masterVideo.paused) {
      const currentTime = masterVideo.currentTime;
      setLocalTime(currentTime);

      const clipStartTime = clipStartTimes[currentClipIndex] || 0;
      setGlobalTime(clipStartTime + currentTime);
    }

    if (isPlayingRef.current) {
      const syncThreshold = Math.max(0.5, 0.3 * playbackRate);

      Object.keys(videoRefs.current).forEach(key => {
        const vid = videoRefs.current[key];
        if (!vid) return;

        if (!vid.paused && vid.readyState === 2) {
          stallCountersRef.current[key] = (stallCountersRef.current[key] || 0) + 1;
          if (stallCountersRef.current[key] > 3) {
            vid.currentTime += 0.001;
            stallCountersRef.current[key] = 0;
          }
        } else {
          stallCountersRef.current[key] = 0;
        }

        if (key === masterCam) return;

        if (masterVideo && Math.abs(vid.currentTime - masterVideo.currentTime) > syncThreshold) {
          if (vid.readyState >= 3) {
            vid.currentTime = masterVideo.currentTime;
          }
        }

        if (vid.paused && !vid.ended && vid.readyState >= 3) {
          safePlay(vid);
        }
      });
    }

    if (isPlayingRef.current) {
      animationFrameRef.current = requestAnimationFrame(syncLoop);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(syncLoop);
    } else {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying, isBuffering, currentClipIndex, playbackRate, clipStartTimes, isSeeking]);

  const togglePlay = () => {
    const isEnded = totalEventDuration > 0 && Math.abs(globalTime - totalEventDuration) < 1;
    let shouldPlay = !isPlaying;

    if (!isPlaying && isEnded) {
      applyGlobalSeek(0);
      shouldPlay = true;
    }

    setIsPlaying(shouldPlay);

    if (!shouldPlay) {
      Object.values(videoRefs.current).forEach(v => {
        if (v) v.pause();
      });
    } else {
      setTimeout(() => {
        Object.values(videoRefs.current).forEach(v => {
          if (v) {
            v.playbackRate = playbackRate;
            if (Math.abs(v.currentTime - localTime) > 0.5) v.currentTime = localTime;
            safePlay(v);
          }
        });
      }, 250);
    }
  };

  const handleVideoEnded = () => {
    if (selectedEvent && currentClipIndex < selectedEvent.clips.length - 1) {
      setCurrentClipIndex(prev => prev + 1);
      setLocalTime(0);
    } else {
      setIsPlaying(false);
    }
  };

  const skip = (seconds) => {
    let newGlobal = globalTime + seconds * playbackRate; // Scaled skip
    newGlobal = Math.max(0, Math.min(newGlobal, totalEventDuration));
    applyGlobalSeek(newGlobal);
  };

  // --- CORE: Sync isPlaying State to Video Elements ---
  useEffect(() => {
    Object.values(videoRefs.current).forEach(v => {
      if (!v) return;

      v.playbackRate = playbackRate;

      if (isPlaying && !isSeeking && !isBuffering) {
        safePlay(v);
      } else {
        v.pause();
      }
    });
  }, [isPlaying, isSeeking, isBuffering, playbackRate, activeVideoUrls]);

  // --- File Processing ---

  const handleFolderSelect = async (event) => {
    setLoadingFiles(true);
    const files = Array.from(event.target.files);

    events.forEach(evt => {
      if (evt.thumbUrl) URL.revokeObjectURL(evt.thumbUrl);
    });
    setEvents([]);
    setSelectedEventId(null);
    Object.values(blobCacheRef.current).forEach(obj => Object.values(obj).forEach(url => URL.revokeObjectURL(url)));
    blobCacheRef.current = {};

    if (files.length === 0) { setLoadingFiles(false); return; }

    const eventMap = new Map();
    const fileRegex = /(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})-(.*)\.mp4$/;

    for (const file of files) {
      if (file.name.startsWith('.')) continue;
      const pathParts = file.webkitRelativePath.split('/');
      const parentFolder = pathParts.slice(0, -1).join('/');
      const fileName = pathParts[pathParts.length - 1];

      if (!eventMap.has(parentFolder)) {
        eventMap.set(parentFolder, {
          id: parentFolder,
          name: pathParts[pathParts.length - 2] || 'Unknown Event',
          files: [],
          clips: [],
          metadata: null,
          timestamp: null,
          reasonCode: null,
          reasonLabel: null,
          thumb: null,
          thumbUrl: null
        });
      }

      const eventData = eventMap.get(parentFolder);
      if (fileName === 'event.json') {
        try {
          const text = await file.text();
          eventData.metadata = JSON.parse(text);
          if (eventData.metadata.reason) {
            eventData.reasonCode = eventData.metadata.reason;
            eventData.reasonLabel = getReasonLabel(eventData.metadata.reason);
          }
        } catch (e) { }
      } else if (fileName === 'thumb.png') {
        eventData.thumb = file;
      } else {
        const match = fileName.match(fileRegex);
        if (match) {
          eventData.files.push({
            file,
            date: match[1],
            time: match[2],
            camera: match[3]
          });
        }
      }
    }

    const processedEvents = Array.from(eventMap.values()).map(evt => {
      const clipsMap = new Map();
      evt.files.forEach(f => {
        const key = `${f.date}_${f.time}`;
        if (!clipsMap.has(key)) {
          clipsMap.set(key, { timestamp: key, date: f.date, time: f.time, videos: {} });
        }
        clipsMap.get(key).videos[f.camera] = f.file;
      });

      evt.clips = Array.from(clipsMap.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      let displayTitle = evt.name;
      let location = "";

      if (evt.metadata) {
        if (evt.metadata.timestamp) evt.timestamp = evt.metadata.timestamp;
        const { city, street } = evt.metadata;
        location = `${city || ''}${street || ''}`.trim();
      }

      if (!evt.timestamp && evt.clips.length > 0) {
        // If no event.json timestamp, calculate time range from clips
        const firstClip = evt.clips[0];
        const lastClip = evt.clips[evt.clips.length - 1];

        const startTime = parseTeslaTimestamp(firstClip.date, firstClip.time);
        // Approximate end time: start of the last clip + DEFAULT_CLIP_DURATION
        const endTime = parseTeslaTimestamp(lastClip.date, lastClip.time);
        endTime.setSeconds(endTime.getSeconds() + DEFAULT_CLIP_DURATION);

        evt.timeRange = formatEventTimeRange(startTime, endTime);
      }

      if (!evt.reasonLabel) evt.reasonLabel = getReasonLabel(evt.metadata?.reason); // Ensure reasonLabel is set or derived

      if (evt.thumb) {
        evt.thumbUrl = URL.createObjectURL(evt.thumb);
      }

      // Determine the sort key (latest clip start time)
      let sortKey = 0;
      if (evt.clips.length > 0) {
        const lastClip = evt.clips[evt.clips.length - 1];
        sortKey = parseTeslaTimestamp(lastClip.date, lastClip.time).getTime();
      } else if (evt.timestamp) {
        sortKey = new Date(evt.timestamp).getTime();
      }


      return { ...evt, displayTitle, location, sortKey };
    })
      .filter(evt => evt.clips.length > 0)
      .sort((a, b) => b.sortKey - a.sortKey); // Newest first

    setEvents(processedEvents);
    setLoadingFiles(false);
  };

  const handleEventSelect = (evt) => {
    Object.values(blobCacheRef.current).forEach(obj => Object.values(obj).forEach(url => URL.revokeObjectURL(url)));
    blobCacheRef.current = {};

    setSelectedEventId(evt.id);
    setCurrentClipIndex(0);
    setIsPlaying(true);
    setAutoSeekPending(true);
    setLocalTime(0);
    setGlobalTime(0);

    setShowMobileList(false);

    const defaultDurations = evt.clips.map(() => DEFAULT_CLIP_DURATION);
    setClipDurations(defaultDurations);

    let defaultCam = 'front';
    if (evt.metadata && evt.metadata.camera) {
      const camIndex = parseInt(evt.metadata.camera, 10);
      if (!isNaN(camIndex) && CAMERA_INDEX_MAP[camIndex]) {
        defaultCam = CAMERA_INDEX_MAP[camIndex].file;
      }
    }
    setMainCamera(defaultCam);

    const newStatus = { ...readStatus, [evt.name]: true };
    setReadStatus(newStatus);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tesla_sentry_read_status', JSON.stringify(newStatus));
    }
  };

  const toggleReadStatus = (e, evtName) => {
    e.stopPropagation();
    const newStatus = { ...readStatus, [evtName]: !readStatus[evtName] };
    setReadStatus(newStatus);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tesla_sentry_read_status', JSON.stringify(newStatus));
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-[#232629] text-gray-900 dark:text-zinc-200 font-sans overflow-hidden transition-colors duration-300">
      <style>{`
        .text-shadow {
          text-shadow: 0 0 5px rgba(0,0,0,0.9); 
        }
        .text-shadow-light {
          text-shadow: 0 0 2px rgba(0,0,0,0.7);
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; 
          border-radius: 20px;
        }
        .dark .scrollbar-thin::-webkit-scrollbar-thumb {
          background-color: #313438; 
        }
        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .dark .scrollbar-thin {
          scrollbar-color: #313438 transparent;
        }
        .tooltip-trigger:hover .tooltip-content {
            opacity: 100;
        }
        .tooltip-content {
            top: -28px; 
            margin-top: -8px; 
            z-index: 50; 
        }
      `}</style>

      {/* Sidebar */}
      <div className={`flex-col border-r border-gray-200 dark:border-[#313438] shrink-0 bg-white dark:bg-[#232629] 
          ${showMobileList ? 'flex w-full' : 'hidden'} 
          md:flex md:w-80 transition-colors duration-300`}>
        <div className="p-4 border-b border-gray-200 dark:border-[#313438]">
          <Link href="/">
            <h1 className="text-xl font-bold text-red-600 dark:text-red-500 flex items-center justify-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center bg-transparent shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-red-600 shadow-[0_0_6px_rgba(220,38,38,0.8)]"></div>
              </div>
              哨兵播放器
            </h1>
          </Link>
          <button onClick={() => fileInputRef.current.click()} className="mt-4 w-full bg-gray-100 dark:bg-[#313438] hover:bg-gray-200 dark:hover:bg-[#42454a] text-gray-900 dark:text-white text-sm py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors">
            {loadingFiles ? <Loader2 className="animate-spin" size={16} /> : <FolderOpen size={16} />}
            {loadingFiles ? '分析中...' : '選擇 TeslaCam 資料夾'}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFolderSelect} webkitdirectory="true" directory="" multiple className="hidden" />
        </div>
        <div className="flex-1 overflow-y-auto pt-8 pb-2 px-2 space-y-2 scrollbar-thin">
          {events.map((evt) => (
            <div key={evt.id} onClick={() => handleEventSelect(evt)} className={`group relative p-2 rounded-lg cursor-pointer transition-all border border-transparent ${selectedEventId === evt.id ? 'bg-blue-50 dark:bg-[#313438] border-blue-200 dark:border-[#42454a]' : 'hover:bg-gray-50 dark:hover:bg-[#313438] hover:border-gray-200 dark:hover:border-[#313438]'}`}>
              <div className="flex gap-3 items-start"> {/* items-start 靠上對齊 */}
                <div className="w-24 shrink-0 aspect-[4/3] bg-black rounded overflow-hidden border border-gray-200 dark:border-[#313438] flex items-center justify-center relative">
                  {evt.thumbUrl ? (
                    <img src={evt.thumbUrl} className="w-full h-full object-contain" alt="Event Thumbnail" />
                  ) : (
                    <div className="text-zinc-600 flex flex-col items-center">
                      <ImageIcon size={20} className="mb-1 opacity-50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-medium text-sm text-gray-900 dark:text-white truncate leading-tight max-w-full">
                      <Tooltip content={evt.id}>
                        <span className="hover:underline hover:decoration-dashed">{evt.location || evt.displayTitle}</span>
                      </Tooltip>
                    </div>
                    <button onClick={(e) => toggleReadStatus(e, evt.name)} className="text-gray-400 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-400 shrink-0">
                      {readStatus[evt.name] ? <EyeOff size={14} /> : <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>}
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {/* 1. 時間 */}
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-zinc-500">
                      <Clock size={12} />
                      {evt.timestamp ? (
                        <span className="font-mono">{formatFullTimestamp(evt.timestamp)}</span>
                      ) : (
                        <span className="font-mono">{evt.timeRange || 'N/A'}</span>
                      )}
                    </div>

                    {/* 2. 原因 */}
                    {evt.reasonLabel && evt.reasonLabel !== 'Sentry Mode' && (
                      <span className="text-xs text-gray-400 dark:text-zinc-400">
                        {evt.reasonLabel}
                      </span>
                    )}

                    {/* 3. 地標 */}
                    {evt.metadata?.est_lat && evt.metadata?.est_lon && (
                      <a
                        href={`https://www.google.com/maps?q=${evt.metadata.est_lat},${evt.metadata.est_lon}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 w-fit hover:opacity-80 transition-opacity"
                      >
                        <div className="bg-blue-900/50 text-blue-200 px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border border-blue-500/30">
                          <MapPin size={10} />
                          <Tooltip content="開啟地圖">
                            <span>{Number(evt.metadata.est_lat).toFixed(4)}, {Number(evt.metadata.est_lon).toFixed(4)}</span>
                          </Tooltip>
                        </div>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Player */}
      <div className={`flex-col h-full relative bg-gray-50 dark:bg-[#232629]
          ${!showMobileList ? 'flex w-full' : 'hidden'} 
          md:flex md:flex-1 transition-colors duration-300`}>

        {!selectedEvent ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-zinc-600">
            <Video size={64} className="mb-4 opacity-20" />
            <p className="text-lg">請選擇左側事件以開始播放</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-14 bg-white dark:bg-[#232629] border-b border-gray-200 dark:border-[#313438] flex items-center px-4 md:px-6 justify-between shrink-0 z-10 gap-3 transition-colors duration-300">
              <button
                onClick={() => setShowMobileList(true)}
                className="md:hidden text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white shrink-0 -ml-2 p-2"
              >
                <ChevronLeft size={24} />
              </button>

              <div className="flex flex-col min-w-0 flex-1 justify-center overflow-hidden">
                <h2 className="text-base md:text-lg font-bold text-gray-900 dark:text-white truncate leading-tight">
                  {selectedEvent.location || selectedEvent.displayTitle}
                </h2>
                <div className="text-[10px] md:text-xs text-gray-500 dark:text-zinc-500 truncate font-mono leading-tight" title={selectedEvent.id}>
                  {selectedEvent.id}
                </div>
              </div>

              <div className="text-sm font-mono text-gray-500 dark:text-zinc-400 shrink-0 flex items-center gap-2">
                {analyzingDurations && <span className="text-[10px] text-yellow-500 animate-pulse hidden md:inline">(Analysing...)</span>}
                <span>
                  （{currentClipIndex + 1} / {selectedEvent.clips.length}）
                </span>
              </div>
            </div>

            {/* Video Area */}
            <div className="flex-1 bg-black relative p-2 overflow-hidden flex flex-col items-center justify-center">
              {/* Main View */}
              <div className="w-full max-h-full aspect-[4/3] relative flex items-center justify-center mb-2 rounded overflow-hidden bg-black border border-gray-800 dark:border-[#313438] shrink-1">
                {isBuffering && (
                  <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 text-red-500 animate-spin mb-2" />
                    <span className="text-xs text-white/80">Buffering...</span>
                  </div>
                )}

                {activeVideoUrls[mainCamera] ? (
                  <video
                    preload="auto"
                    ref={el => videoRefs.current[mainCamera] = el}
                    src={activeVideoUrls[mainCamera]}
                    className="w-full h-full object-contain"
                    style={{ transform: CAMERA_SETTINGS[mainCamera]?.mirror ? 'scaleX(-1)' : 'none' }}
                    onEnded={mainCamera === getMasterCamera() ? handleVideoEnded : undefined}
                    onLoadedMetadata={(e) => handleVideoLoad(e, mainCamera)}
                    onCanPlay={(e) => handleVideoLoad(e, mainCamera)}
                    disablePictureInPicture
                  />
                ) : <div className="text-zinc-600">No Signal</div>}

                {/* Time Display */}
                <div className="absolute top-4 right-4 bg-black/20 px-2 py-1 rounded-full text-xs text-white font-mono font-bold text-shadow-light">
                  {currentRealTimeDisplay}
                </div>

                {/* Camera Badge */}
                <div className="absolute top-4 left-4 bg-black/20 px-2 py-1 rounded-full text-xs text-white uppercase font-bold tracking-wider text-shadow-light">
                  {CAMERA_SETTINGS[mainCamera]?.name || mainCamera}
                </div>
              </div>

              {/* Sub Views */}
              <div className="w-full flex justify-center gap-2 px-10">
                {sortedViews.map(angle => {
                  if (angle === mainCamera || angle === 'inside') return null;
                  return (
                    <div key={angle} className="relative w-1/4 aspect-[4/3] bg-black rounded overflow-hidden border border-gray-800 dark:border-[#313438] cursor-pointer hover:border-blue-500 transition-colors" onClick={() => setMainCamera(angle)}>
                      {activeVideoUrls[angle] ? (
                        <video
                          preload="auto"
                          ref={el => videoRefs.current[angle] = el}
                          src={activeVideoUrls[angle]}
                          className="w-full h-full object-contain"
                          style={{ transform: CAMERA_SETTINGS[angle]?.mirror ? 'scaleX(-1)' : 'none' }}
                          muted
                          playsInline
                          onEnded={angle === getMasterCamera() ? handleVideoEnded : undefined}
                          onLoadedMetadata={(e) => handleVideoLoad(e, angle)}
                          onCanPlay={(e) => handleVideoLoad(e, angle)}
                          disablePictureInPicture
                        />
                      ) : <div className="w-full h-full flex items-center justify-center text-xs text-zinc-600">No Signal</div>}
                      <div className="absolute bottom-1 right-1 bg-black/20 px-2 py-0.5 rounded-full text-xs text-white uppercase text-shadow-light">
                        {CAMERA_SETTINGS[angle]?.name || angle}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Controls */}
            <div className="h-24 bg-white dark:bg-[#232629] border-t border-gray-200 dark:border-[#313438] flex flex-col px-6 py-4 shrink-0 justify-center transition-colors duration-300">
              <div className="flex items-center gap-3 text-xs font-mono text-gray-500 dark:text-zinc-400 mb-4 relative">
                <span className="w-12 text-right">{formatDuration(globalTime)}</span>
                <div className="flex-1 relative h-6 flex items-center">
                  <div className="absolute w-full h-1.5 bg-gray-200 dark:bg-[#313438] rounded-full overflow-hidden">
                    <div className="h-full bg-red-600/60" style={{ width: `${(globalTime / totalEventDuration) * 100}%` }}></div>
                  </div>
                  {eventTriggerTimeOffset !== null && (
                    <div className="absolute h-3 w-3 bg-red-500 rounded-full border-2 border-white z-10 shadow-lg top-1.5 -ml-1.5 pointer-events-none" style={{ left: `${(eventTriggerTimeOffset / totalEventDuration) * 100}%` }} title="Event Triggered"></div>
                  )}
                  <input
                    type="range"
                    min="0"
                    max={totalEventDuration || 1}
                    step="0.1"
                    value={globalTime}
                    onMouseDown={handleSeekStart}
                    onTouchStart={handleSeekStart}
                    onChange={handleGlobalSeek}
                    onMouseUp={handleSeekEnd}
                    onTouchEnd={handleSeekEnd}
                    className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer z-20 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                  />
                </div>
                <span className="w-12 text-right">-{formatDuration(Math.max(0, totalEventDuration - globalTime))}</span>
              </div>

              <div className="flex items-center justify-between px-2">
                <div className="flex items-center w-24 justify-start gap-2">
                  <button
                    onClick={resetToStart}
                    className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#313438] flex flex-col items-center"
                    title="Reset to Start"
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button
                    onClick={handleSnapshot}
                    className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#313438] flex flex-col items-center"
                    title="Snapshot"
                  >
                    <Camera size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-6">
                  <button onClick={() => skip(-10)} className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#313438]"><SkipBack size={24} /></button>
                  <button onClick={togglePlay} className="bg-gray-900 dark:bg-white text-white dark:text-black p-3 rounded-full hover:bg-gray-700 dark:hover:bg-gray-200 transition-transform active:scale-95 shadow-lg shadow-black/10 dark:shadow-white/10">
                    {isBuffering ? <Loader2 size={24} className="animate-spin text-gray-400 dark:text-gray-500" /> : (isPlaying ? <Pause size={24} className="fill-white dark:fill-black" /> : <Play size={24} className="ml-1 fill-white dark:fill-black" />)}
                  </button>
                  <button onClick={() => skip(10)} className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#313438]"><SkipForward size={24} /></button>
                </div>

                <div className="flex items-center w-24 justify-end">
                  <select value={playbackRate} onChange={(e) => setPlaybackRate(parseFloat(e.target.value))} className="bg-gray-100 dark:bg-[#313438] text-xs text-gray-700 dark:text-zinc-300 border border-gray-200 dark:border-[#42454a] rounded px-2 py-1 outline-none focus:border-blue-500">
                    {PLAYBACK_RATES.map(rate => <option key={rate} value={rate}>{rate}x</option>)}
                  </select>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}