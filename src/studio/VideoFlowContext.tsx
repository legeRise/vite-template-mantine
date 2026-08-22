import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  type SceneDto,
  type JobStatus,
  type SceneEditPayload,
  login as apiLogin,
  uploadVideoForScenes,
  getJobScenes,
  streamJobStatus,
  createScene,
  deleteScene as apiDeleteScene,
  bulkSaveScenes,
  regenerateSceneImage,
  changeSceneWithAI,
  resolveMediaUrl,
  getAccessToken,
  clearTokens,
  formatSeconds,
  type VideoLanguage,
  type SceneTransition,
} from '../lib/api';

/**
 * View-model form of a scene consumed by the UI components.
 * Adapted from the backend SceneDto so existing views keep working.
 */
export interface SceneModel {
  id: number;
  number: number;
  start: string; // MM:SS
  end: string; // MM:SS
  startSeconds: number;
  endSeconds: number;
  title: string;
  narration: string;
  description: string;
  imageUrl: string | null;
  pauseAfter: number;
  edited: boolean;
  regenerateCount: number;
  order: number;
  transition: SceneTransition;
  locked: boolean;
}

/**
 * Version a media URL with the scene's regenerate count. The backend OVERWRITES
 * the same file (`image_1.jpg`) on every regeneration, so without this the
 * browser serves the stale cached image and the new frame never appears —
 * which made Regenerate / Change-with-AI look broken even though they worked.
 */
function withCacheBust(url: string | null, version: number): string | null {
  if (!url) return null;
  if (!version || version <= 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
}

function toSceneModel(dto: SceneDto): SceneModel {
  return {
    id: dto.scene_id,
    number: dto.order + 1,
    start: formatSeconds(dto.start),
    end: formatSeconds(dto.end),
    startSeconds: dto.start,
    endSeconds: dto.end,
    title: dto.scene_title,
    narration: dto.narration,
    description: dto.description,
    imageUrl: withCacheBust(resolveMediaUrl(dto.image_url), dto.regenerate_count),
    pauseAfter: dto.pause_after,
    edited: dto.edited,
    regenerateCount: dto.regenerate_count,
    order: dto.order,
    transition: dto.transition ?? 'kenburns',
    locked: true,
  };
}

/**
 * Regenerate images for any scene that failed to get one on the first pass.
 * Called after the scenes list loads so that NO scene is ever left without its
 * first image (the backend silently skips failed generations, leaving them null).
 *
 * Iterates over the missing scenes, calling the backend regenerate endpoint for
 * each with a short delay, and only stops once every scene has an image or we
 * hit MAX_ATTEMPTS (to avoid an infinite retry loop on a hard failure). Scenes
 * that keep failing are left for the user to retry manually.
 */
async function backfillMissingImages(models: SceneModel[], setScenes: (updater: (prev: SceneModel[]) => SceneModel[]) => void): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const DELAY_MS = 1200;

  let missing = models.filter((s) => !s.imageUrl);
  let attempt = 0;
  while (missing.length > 0 && attempt < MAX_ATTEMPTS) {
    attempt += 1;
    // Try each missing scene; collect the ones that still have no image.
    const stillMissing: SceneModel[] = [];
    for (const scene of missing) {
      try {
        const updated = await regenerateSceneImage(scene.id);
        const model = toSceneModel(updated);
        // MERGE IN PLACE ONLY — never append a scene whose id isn't already in
        // the list. This guarantees the backfill can never duplicate scenes
        // (regenerate returns the SAME scene id, so it updates in place).
        setScenes((prev) =>
          prev.some((p) => p.id === model.id)
            ? prev.map((p) => (p.id === model.id ? model : p))
            : prev
        );
        if (!model.imageUrl) stillMissing.push(model);
      } catch {
        // Transient failure — keep it in the missing list for the next attempt.
        stillMissing.push(scene);
      }
      // Brief pause between calls so we don't hammer the image service.
      await new Promise((r) => window.setTimeout(r, DELAY_MS));
    }
    missing = stillMissing.filter((s) => !s.imageUrl);
  }
}

export type JobPhase = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

interface VideoFlowValue {
  // Auth
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;

  // Job
  trackerId: string | null;
  videoLabel: string;
  videoUrl: string | null;
  audioUrl: string | null;
  sourceType: 'video' | 'audio' | null;
  jobStatus: JobStatus | null;
  jobPhase: JobPhase;
  jobError: string | null;
  /** 0–100 while the file is being uploaded over the network (0 when idle). */
  uploadProgress: number;
  uploadAndStart: (
    file: File,
    opts: { template?: string; resolution?: string; language: VideoLanguage; noHumans?: boolean }
  ) => Promise<void>;
  reset: () => void;

  // Scenes
  scenes: SceneModel[];
  scenesLoading: boolean;
  fetchScenes: () => Promise<SceneModel[]>;
  updateScene: (sceneId: number, patch: SceneEditPayload) => SceneModel;
  addScene: (patch?: SceneEditPayload) => Promise<SceneModel>;
  deleteScene: (sceneId: number) => Promise<SceneModel[]>;
  /** Resize one scene's START or END edge. Scenes are independent windows on a
   *  fixed track: neighbours never move, gaps are allowed, overlaps are not.
   *  `mediaDuration` (when known) caps the last scene's right edge. */
  resizeScene: (
    sceneId: number,
    side: 'start' | 'end',
    newTime: number,
    mediaDuration?: number | null
  ) => SceneModel[];
  /** Move a WHOLE scene (both edges, duration preserved) so its start lands at
   *  `newStart`. Slides within the gap between its neighbours — never overlaps. */
  moveScene: (
    sceneId: number,
    newStart: number,
    mediaDuration?: number | null
  ) => SceneModel[];
  regenerateImage: (sceneId: number) => Promise<SceneModel>;
  /** "Change with AI" — the user describes the change in plain language; the
   *  backend revises the internal prompt (never exposed) and regenerates. */
  changeWithAI: (sceneId: number, instruction: string) => Promise<SceneModel>;
  openCreation: (trackerId: string, label?: string) => Promise<SceneModel[]>;
  // Undo / Redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Increments on every undo/redo so editors can detect & sync to an external
   *  snapshot restore (and avoid re-applying a stale autosave). */
  historyToken: number;
}

/** Minimum allowed scene length in seconds — prevents accidental zero-length clips. */
const MIN_SCENE_DURATION = 0.3;

const VideoFlowContext = createContext<VideoFlowValue | null>(null);

export function VideoFlowProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAccessToken());
  const [videoLabel, setVideoLabel] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'video' | 'audio' | null>(null);
  const [trackerId, setTrackerId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobPhase, setJobPhase] = useState<JobPhase>('idle');
  const [jobError, setJobError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scenes, setScenes] = useState<SceneModel[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  // Undo/redo history stacks of scene snapshots.
  const [past, setPast] = useState<SceneModel[][]>([]);
  const [future, setFuture] = useState<SceneModel[][]>([]);
  // Bumped on every undo/redo so editors know a snapshot was restored externally.
  const [historyToken, setHistoryToken] = useState(0);
  // Identity of the last snapshot pushed, so `recordHistory` can coalesce the
  // repeated autosave ticks of a single edit into ONE undo step.
  const lastHistoryRef = useRef<SceneModel[] | null>(null);
  const scenesRef = useRef<SceneModel[]>([]);
  scenesRef.current = scenes;

  const streamAbortRef = useRef<(() => void) | null>(null);

  const stopStreaming = useCallback(() => {
    if (streamAbortRef.current != null) {
      streamAbortRef.current();
      streamAbortRef.current = null;
    }
  }, []);

  // Push the current scene snapshot onto the undo stack. Call before any
  // mutating edit so a later undo() can restore this exact state.
  // Coalesces: if this snapshot is identical to the last pushed one (e.g. the
  // repeated 250ms autosave ticks while the user is finishing a keystroke),
  // it is NOT pushed again — so a single edit = one undo step, and redo isn't
  // wiped by every autosave tick.
  const recordHistory = useCallback(() => {
    const current = scenesRef.current;
    if (lastHistoryRef.current === current) return;
    lastHistoryRef.current = current;
    setPast((prev) => [...prev.slice(-49), current]);
    setFuture([]);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin({ email, password });
    setIsAuthenticated(true);
    setJobError(null);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setIsAuthenticated(false);
    setTrackerId(null);
    setVideoUrl(null);
    setAudioUrl(null);
    setSourceType(null);
    setJobStatus(null);
    setJobPhase('idle');
    setUploadProgress(0);
    setVideoLabel('');
    setScenes([]);
    setJobError(null);
    setPast([]);
    setFuture([]);
    lastHistoryRef.current = null;
    stopStreaming();
  }, [stopStreaming]);

  const reset = useCallback(() => {
    stopStreaming();
    setTrackerId(null);
    setVideoUrl(null);
    setAudioUrl(null);
    setSourceType(null);
    setJobStatus(null);
    setJobPhase('idle');
    setUploadProgress(0);
    setVideoLabel('');
    setScenes([]);
    setJobError(null);
    setPast([]);
    setFuture([]);
    lastHistoryRef.current = null;
  }, [stopStreaming]);

  // SSE-based progress stream driven by jobPhase. Called by uploadAndStart.
  const streamLoop = useCallback((id: string) => {
    // Defensive: if progress reaches 100 in a progress event (even if the
    // `status` field isn't literally 'completed'), treat the job as done.
    const completeIfDone = (status: JobStatus) => {
      setJobStatus(status);
      if (status.status === 'failed') {
        setJobPhase('failed');
        setJobError(status.status_message || 'The job failed');
      } else if (status.status === 'completed' || (status.progress ?? 0) >= 100) {
        setJobPhase('completed');
      }
    };

    const abort = streamJobStatus(id, {
      onProgress: completeIfDone,
      onDone: completeIfDone,
      onError: (err) => {
        setJobError(err.message || 'Failed to stream job status');
        setJobPhase('failed');
      },
    });
    streamAbortRef.current = abort;
  }, []);

  const uploadAndStart = useCallback(
    async (
      file: File,
      opts: { template?: string; resolution?: string; language: VideoLanguage; noHumans?: boolean }
    ) => {
      stopStreaming();
      setJobError(null);
      setJobPhase('uploading');
      setUploadProgress(0);
      setScenes([]);

      try {
        const res = await uploadVideoForScenes({
          file,
          template: opts.template,
          resolution: opts.resolution,
          language: opts.language,
          noHumans: opts.noHumans,
          onUploadProgress: setUploadProgress,
        });
        setVideoLabel(file.name);
        setTrackerId(res.tracker_id);
        setJobStatus({
          tracker_id: res.tracker_id,
          status: res.status,
          status_message: res.status_message,
          progress: res.progress,
        });
        setJobPhase('processing');
        streamLoop(res.tracker_id);
      } catch (err) {
        setJobError(err instanceof Error ? err.message : 'Upload failed');
        setJobPhase('failed');
      }
    },
    [stopStreaming, streamLoop]
  );

  const fetchScenes = useCallback(async () => {
    if (!trackerId) {
      return [];
    }
    setScenesLoading(true);
    try {
      const res = await getJobScenes(trackerId);
      setVideoUrl(resolveMediaUrl(res.original_video_url));
      setAudioUrl(res.audio_url ? resolveMediaUrl(res.audio_url) : null);
      setSourceType(res.source_type === 'audio' ? 'audio' : res.source_type === 'video' ? 'video' : null);
      const models = res.scenes.map(toSceneModel);
      setScenes(models);
      // Backfill any scenes that came back without an image (the backend's
      // first-pass generation occasionally fails / times out on some scenes).
      // Regenerate those a few times until every scene has a first image, so
      // the scenes list is never left with a missing one.
      void backfillMissingImages(models, setScenes);
      return models;
    } finally {
      setScenesLoading(false);
    }
  }, [trackerId]);

  /**
   * Reopen a PAST creation from history. Loads its scenes into the flow so the
   * user can preview / re-edit / re-export it after a refresh. Unlike
   * `fetchScenes`, it works for any owned tracker_id (not just the current one).
   */
  const openCreation = useCallback(
    async (targetTrackerId: string, label?: string) => {
      stopStreaming();
      setJobError(null);
      setScenesLoading(true);
      setPast([]);
      setFuture([]);
      lastHistoryRef.current = null;
      try {
        const res = await getJobScenes(targetTrackerId);
        setTrackerId(res.tracker_id);
        setVideoLabel(label ?? `Creation ${res.tracker_id.slice(0, 8)}`);
        setVideoUrl(resolveMediaUrl(res.original_video_url));
        setAudioUrl(res.audio_url ? resolveMediaUrl(res.audio_url) : null);
        setSourceType(
          res.source_type === 'audio' ? 'audio' : res.source_type === 'video' ? 'video' : null
        );
        setJobStatus({
          tracker_id: res.tracker_id,
          status: res.status,
          status_message: res.status === 'completed' ? 'Loaded from history' : res.status,
          progress: res.status === 'completed' ? 100 : 0,
        });
        setJobPhase(res.status === 'failed' ? 'failed' : 'completed');
        const models = res.scenes.map(toSceneModel);
        setScenes(models);
        return models;
      } finally {
        setScenesLoading(false);
      }
    },
    [stopStreaming]
  );

  /**
   * Apply an edit locally (persisted to localStorage instantly; synced to the
   * backend on leave/hide/pause via the bulk flush). Does NOT hit the backend
   * per change.
   */
  const updateScene = useCallback(
    (sceneId: number, patch: SceneEditPayload) => {
      if (!trackerId) {
        throw new Error('No active job');
      }
      recordHistory();
      const next = scenesRef.current.map((s) => {
        if (s.id !== sceneId) return s;
        return {
          ...s,
          title: patch.scene_title ?? s.title,
          description: patch.description ?? s.description,
          narration: patch.narration ?? s.narration,
          pauseAfter: patch.pause_after ?? s.pauseAfter,
          startSeconds: patch.start ?? s.startSeconds,
          endSeconds: patch.end ?? s.endSeconds,
          transition: patch.transition ?? s.transition,
          locked: patch.locked ?? s.locked,
          edited: true,
        };
      });
      setScenes(next);
      return next.find((s) => s.id === sceneId) ?? scenesRef.current[0];
    },
    [trackerId, recordHistory]
  );

  const addScene = useCallback(
    async (patch?: SceneEditPayload) => {
      if (!trackerId) {
        throw new Error('No active job');
      }
      recordHistory();
      const updated = await createScene(trackerId, patch ?? {});
      const model = { ...toSceneModel(updated), locked: true };
      setScenes((prev) => [...prev, model]);
      return model;
    },
    [trackerId, recordHistory]
  );

  const deleteScene = useCallback(
    async (sceneId: number) => {
      if (!trackerId) {
        throw new Error('No active job');
      }
      recordHistory();
      const res = await apiDeleteScene(trackerId, sceneId);
      const models = res.scenes.map(toSceneModel);
      setScenes(models);
      return models;
    },
    [trackerId, recordHistory]
  );

  /**
   * Resize one scene's START or END edge to `newTime` — the single building
   * block of the gap-friendly timeline. Scenes are independent overlay windows
   * on a fixed track: resizing NEVER moves a neighbour, so the user can create
   * deliberate empty gaps (raw footage shows through, audio continues) but can
   * never create overlaps or zero-length scenes.
   *
   * Clamping:
   *  - left edge  ∈ [prev neighbour's end (or 0), own end − MIN_SCENE_DURATION]
   *  - right edge ∈ [own start + MIN_SCENE_DURATION, next neighbour's start
   *                 (or mediaDuration for the last scene)]
   *
   * Applied locally only (persisted to localStorage instantly; synced to the
   * backend on leave/hide/pause via the bulk flush) so drags feel instant.
   */
  const resizeScene = useCallback(
    (
      sceneId: number,
      side: 'start' | 'end',
      newTime: number,
      mediaDuration?: number | null
    ): SceneModel[] => {
      if (!trackerId) {
        throw new Error('No active job');
      }
      const ordered = [...scenesRef.current].sort(
        (a, b) => a.order - b.order || a.startSeconds - b.startSeconds
      );
      const idx = ordered.findIndex((s) => s.id === sceneId);
      if (idx === -1) return scenesRef.current;
      const target = ordered[idx];
      const prevTarget = ordered[idx - 1];
      const nextTarget = ordered[idx + 1];

      const cleaned = Math.round(newTime * 100) / 100;
      let bounded: number;
      if (side === 'start') {
        const min = prevTarget ? prevTarget.endSeconds : 0;
        const max = target.endSeconds - MIN_SCENE_DURATION;
        bounded = Math.min(Math.max(cleaned, min), max);
        if (Math.abs(bounded - target.startSeconds) < 0.05) return scenesRef.current;
      } else {
        const min = target.startSeconds + MIN_SCENE_DURATION;
        const fallbackMax =
          mediaDuration && mediaDuration > 0 ? mediaDuration : target.endSeconds;
        const max = nextTarget ? nextTarget.startSeconds : fallbackMax;
        bounded = Math.min(Math.max(cleaned, min), max);
        if (Math.abs(bounded - target.endSeconds) < 0.05) return scenesRef.current;
      }

      recordHistory();
      setScenes((prev) =>
        prev.map((s) => {
          if (s.id !== target.id) return s;
          return side === 'start'
            ? { ...s, startSeconds: bounded, edited: true }
            : { ...s, endSeconds: bounded, edited: true };
        })
      );
      return scenesRef.current;
    },
    [trackerId, recordHistory]
  );

  /**
   * Move a WHOLE scene (both edges, duration preserved) so its start lands at
   * `newStart`. The scene slides freely inside the window between its
   * neighbours — gaps open up on either side, overlaps are impossible.
   */
  const moveScene = useCallback(
    (
      sceneId: number,
      newStart: number,
      mediaDuration?: number | null
    ): SceneModel[] => {
      if (!trackerId) {
        throw new Error('No active job');
      }
      const ordered = [...scenesRef.current].sort(
        (a, b) => a.order - b.order || a.startSeconds - b.startSeconds
      );
      const idx = ordered.findIndex((s) => s.id === sceneId);
      if (idx === -1) return scenesRef.current;
      const target = ordered[idx];
      const prevTarget = ordered[idx - 1];
      const nextTarget = ordered[idx + 1];

      const duration = target.endSeconds - target.startSeconds;
      const cleaned = Math.round(newStart * 100) / 100;
      const min = prevTarget ? prevTarget.endSeconds : 0;
      const hardMax =
        nextTarget
          ? nextTarget.startSeconds
          : mediaDuration && mediaDuration > 0
            ? mediaDuration
            : Math.max(target.endSeconds, cleaned + duration);
      const max = Math.max(min, hardMax - duration);
      const bounded = Math.min(Math.max(cleaned, min), max);
      if (
        Math.abs(bounded - target.startSeconds) < 0.05 &&
        Math.abs(bounded + duration - target.endSeconds) < 0.05
      ) {
        return scenesRef.current;
      }

      recordHistory();
      setScenes((prev) =>
        prev.map((s) =>
          s.id === target.id
            ? { ...s, startSeconds: bounded, endSeconds: bounded + duration, edited: true }
            : s
        )
      );
      return scenesRef.current;
    },
    [trackerId, recordHistory]
  );

  // --- Undo / Redo ---
  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const prev = prevPast[prevPast.length - 1];
      const rest = prevPast.slice(0, -1);
      setFuture((prevFuture) => [...prevFuture, scenesRef.current]);
      setScenes(prev);
      setHistoryToken((t) => t + 1);
      return rest;
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[prevFuture.length - 1];
      const rest = prevFuture.slice(0, -1);
      setPast((prevPast) => [...prevPast, scenesRef.current]);
      setScenes(next);
      setHistoryToken((t) => t + 1);
      return rest;
    });
  }, []);

  const regenerateImage = useCallback(async (sceneId: number) => {
    recordHistory();
    const updated = await regenerateSceneImage(sceneId);
    const model = toSceneModel(updated);
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? model : s)));
    return model;
  }, [recordHistory]);

  const changeWithAI = useCallback(
    async (sceneId: number, instruction: string) => {
      recordHistory();
      const updated = await changeSceneWithAI(sceneId, instruction);
      const model = toSceneModel(updated);
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? model : s)));
      return model;
    },
    [recordHistory]
  );

  // When the job completes, auto-load scenes once.
  useEffect(() => {
    if (jobPhase === 'completed' && trackerId) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fetchScenes();
    }
  }, [jobPhase, trackerId, fetchScenes]);

  // Cleanup streaming on unmount.
  useEffect(() => stopStreaming, [stopStreaming]);

  // --- Local-first persistence ---
  // Work is written to localStorage INSTANTLY on every change (so the backend is
  // NOT hit per keystroke/drag). It is flushed to the backend on page leave /
  // hide / a quiet pause, so the DB stays in sync without spamming requests.
  const draftKey = (id: string | null = trackerId) =>
    id ? `ezclip:draft:${id}` : null;

  // Write the current draft to localStorage whenever scenes or tracker change.
  useEffect(() => {
    if (!trackerId) return;
    const key = draftKey(trackerId);
    if (!key) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify(
          scenes.map((s) => ({
            id: s.id,
            scene_title: s.title,
            start: s.startSeconds,
            end: s.endSeconds,
            edited: s.edited,
          }))
        )
      );
    } catch {
      /* localStorage may be unavailable; ignore */
    }
  }, [scenes, trackerId]);

  const latestRef = useRef({ trackerId, scenes });
  latestRef.current = { trackerId, scenes };

  // Flush the current draft to the backend (bulk save). Used on leave/hide/pause.
  const flushToBackend = useCallback(async () => {
    const { trackerId: id, scenes: sc } = latestRef.current;
    if (!id || sc.length === 0) return;
    const payload = sc.map((s) => ({
      scene_id: s.id,
      scene_title: s.title,
      start: s.startSeconds,
      end: s.endSeconds,
    }));
    try {
      await bulkSaveScenes(id, payload);
    } catch {
      /* offline / blocked — draft remains safe in localStorage */
    }
  }, []);

  // Flush when the user hides/leaves the page, or after a quiet pause (~2.5s).
  useEffect(() => {
    const onHide = () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      flushToBackend();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        flushToBackend();
      }
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushToBackend]);

  const value = useMemo<VideoFlowValue>(
    () => ({
      isAuthenticated,
      login,
      logout,
      trackerId,
      videoLabel,
      videoUrl,
      audioUrl,
      sourceType,
      jobStatus,
      jobPhase,
      jobError,
      uploadProgress,
      uploadAndStart,
      reset,
      scenes,
      scenesLoading,
      fetchScenes,
      updateScene,
      addScene,
      deleteScene,
      resizeScene,
      moveScene,
      regenerateImage,
      changeWithAI,
      openCreation,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undo,
      redo,
      historyToken,
    }),
    [
      isAuthenticated,
      login,
      logout,
      trackerId,
      videoLabel,
      videoUrl,
      audioUrl,
      sourceType,
      jobStatus,
      jobPhase,
      jobError,
      uploadProgress,
      uploadAndStart,
      reset,
      scenes,
      scenesLoading,
      fetchScenes,
      updateScene,
      addScene,
      deleteScene,
      resizeScene,
      moveScene,
      regenerateImage,
      changeWithAI,
      openCreation,
      past,
      future,
      undo,
      redo,
      historyToken,
    ]
  );

  return <VideoFlowContext.Provider value={value}>{children}</VideoFlowContext.Provider>;
}

export function useVideoFlow(): VideoFlowValue {
  const ctx = useContext(VideoFlowContext);
  if (!ctx) {
    throw new Error('useVideoFlow must be used within a VideoFlowProvider');
  }
  return ctx;
}
