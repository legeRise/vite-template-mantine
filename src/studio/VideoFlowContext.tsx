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
  patchScene,
  createScene,
  regenerateSceneImage,
  resolveMediaUrl,
  getAccessToken,
  clearTokens,
  formatSeconds,
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
  prompt: string;
  imageUrl: string | null;
  pauseAfter: number;
  edited: boolean;
  regenerateCount: number;
  order: number;
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
    prompt: dto.image_prompt,
    imageUrl: dto.image_url,
    pauseAfter: dto.pause_after,
    edited: dto.edited,
    regenerateCount: dto.regenerate_count,
    order: dto.order,
  };
}

export type JobPhase = 'uploading' | 'processing' | 'completed' | 'failed';

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
  uploadAndStart: (
    file: File,
    opts?: { template?: string; resolution?: string; language?: string; noHumans?: boolean }
  ) => Promise<void>;
  reset: () => void;

  // Scenes
  scenes: SceneModel[];
  scenesLoading: boolean;
  fetchScenes: () => Promise<SceneModel[]>;
  updateScene: (sceneId: number, patch: SceneEditPayload) => Promise<SceneModel>;
  addScene: (patch?: SceneEditPayload) => Promise<SceneModel>;
  regenerateImage: (sceneId: number, promptOverride?: string) => Promise<SceneModel>;
  openCreation: (trackerId: string, label?: string) => Promise<SceneModel[]>;
}

const VideoFlowContext = createContext<VideoFlowValue | null>(null);

export function VideoFlowProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAccessToken());
  const [videoLabel, setVideoLabel] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'video' | 'audio' | null>(null);
  const [trackerId, setTrackerId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobPhase, setJobPhase] = useState<JobPhase>('uploading');
  const [jobError, setJobError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<SceneModel[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);

  const streamAbortRef = useRef<(() => void) | null>(null);

  const stopStreaming = useCallback(() => {
    if (streamAbortRef.current != null) {
      streamAbortRef.current();
      streamAbortRef.current = null;
    }
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
    setJobPhase('uploading');
    setVideoLabel('');
    setScenes([]);
    setJobError(null);
    stopStreaming();
  }, [stopStreaming]);

  const reset = useCallback(() => {
    stopStreaming();
    setTrackerId(null);
    setVideoUrl(null);
    setAudioUrl(null);
    setSourceType(null);
    setJobStatus(null);
    setJobPhase('uploading');
    setVideoLabel('');
    setScenes([]);
    setJobError(null);
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
      opts?: { template?: string; resolution?: string; language?: string; noHumans?: boolean }
    ) => {
      stopStreaming();
      setJobError(null);
      setJobPhase('uploading');
      setScenes([]);

      try {
        const res = await uploadVideoForScenes({
          file,
          template: opts?.template,
          resolution: opts?.resolution,
          language: opts?.language || 'en-US',
          noHumans: opts?.noHumans,
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

  const updateScene = useCallback(
    async (sceneId: number, patch: SceneEditPayload) => {
      if (!trackerId) {
        throw new Error('No active job');
      }
      const updated = await patchScene(trackerId, sceneId, patch);
      const model = toSceneModel(updated);
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? model : s)));
      return model;
    },
    [trackerId]
  );

  const addScene = useCallback(
    async (patch?: SceneEditPayload) => {
      if (!trackerId) {
        throw new Error('No active job');
      }
      const updated = await createScene(trackerId, patch ?? {});
      const model = toSceneModel(updated);
      setScenes((prev) => [...prev, model]);
      return model;
    },
    [trackerId]
  );

  const regenerateImage = useCallback(async (sceneId: number, promptOverride?: string) => {
    const updated = await regenerateSceneImage(sceneId, promptOverride);
    const model = toSceneModel(updated);
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? model : s)));
    return model;
  }, []);

  // When the job completes, auto-load scenes once.
  useEffect(() => {
    if (jobPhase === 'completed' && trackerId) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fetchScenes();
    }
  }, [jobPhase, trackerId, fetchScenes]);

  // Cleanup streaming on unmount.
  useEffect(() => stopStreaming, [stopStreaming]);

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
      uploadAndStart,
      reset,
      scenes,
      scenesLoading,
      fetchScenes,
      updateScene,
      addScene,
      regenerateImage,
      openCreation,
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
      uploadAndStart,
      reset,
      scenes,
      scenesLoading,
      fetchScenes,
      updateScene,
      addScene,
      regenerateImage,
      openCreation,
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
