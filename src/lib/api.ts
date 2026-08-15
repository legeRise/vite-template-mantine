// Video → Scenes API client.
// Base URL: https://api.ez-clip.ovh
// Override with VITE_API_BASE_URL in a local .env file if needed.

export const API_BASE_URL: string = (
  (import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  'https://api.ez-clip.ovh'
).replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Auth / token storage
// ---------------------------------------------------------------------------

const ACCESS_KEY = 'ezclip.access';
const REFRESH_KEY = 'ezclip.refresh';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string | null): void {
  localStorage.setItem(ACCESS_KEY, access);
  if (refresh) {
    localStorage.setItem(REFRESH_KEY, refresh);
  }
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ---------------------------------------------------------------------------
// Types (matching the documented API responses)
// ---------------------------------------------------------------------------

export interface AuthResponse {
  access: string;
  refresh: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UploadVideoResponse {
  tracker_id: string;
  status: 'pending' | string;
  status_message: string;
  progress: number;
}

export interface JobStatus {
  tracker_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
  status_message: string;
  progress: number;
  source_type?: string;
  template?: string;
  resolution?: string;
  original_video_url?: string | null;
}

export interface SceneDto {
  scene_id: number;
  order: number;
  scene_title: string;
  description: string;
  narration: string;
  pause_after: number;
  start: number;
  end: number;
  image_prompt: string;
  image_url: string | null;
  image_generated_at: string | null;
  edited: boolean;
  edited_at: string | null;
  regenerate_count: number;
}

export interface ScenesResponse {
  tracker_id: string;
  status: string;
  source_type?: 'video' | 'audio' | null;
  original_video_url?: string | null;
  audio_url?: string | null;
  scenes: SceneDto[];
}

export interface SceneImageResponse {
  scene_id: number;
  image_url: string;
  generated: boolean;
}

// Editable fields for PATCH / PUT on a scene.
export interface SceneEditPayload {
  scene_title?: string;
  description?: string;
  narration?: string;
  image_prompt?: string;
  pause_after?: number;
  start?: number;
  end?: number;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body != null) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    const err = new Error(message) as Error & { status: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Step 0 — login, obtain a JWT token pair. */
export async function login(req: LoginRequest): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/api/auth/jwt/create/', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  setTokens(res.access, res.refresh);
  return res;
}

/** Step 1 — upload a video and queue the job. Returns the tracker_id. */
export async function uploadVideoForScenes(params: {
  file: File;
  template?: string;
  resolution?: string;
  language?: string;
  noHumans?: boolean;
}): Promise<UploadVideoResponse> {
  const form = new FormData();
  form.append('file', params.file);
  if (params.template) {
    form.append('template', params.template);
  }
  if (params.resolution) {
    form.append('resolution', params.resolution);
  }
  if (params.language) {
    form.append('language', params.language);
  }
  if (params.noHumans) {
    form.append('no_humans', 'true');
  }

  return request<UploadVideoResponse>('/api/text2video/upload-video-for-scenes/', {
    method: 'POST',
    body: form,
  });
}

/** Step 2 — poll the job status. */
export async function getJobStatus(trackerId: string): Promise<JobStatus> {
  return request<JobStatus>(`/api/text2video/video-jobs/${trackerId}/status/`);
}

/**
 * Step 2 (SSE) — stream the job's progress via Server-Sent Events.
 *
 * Uses fetch + ReadableStream instead of the native `EventSource` so we can
 * send the `Authorization` header (EventSource cannot set custom headers).
 *
 * Call `onProgress` for each parsed event; call `onDone` when the stream
 * reports a completed/failed status; call `onError` on network/parse errors.
 *
 * Returns an abort function to stop the stream (e.g. on unmount / reset).
 */
export function streamJobStatus(
  trackerId: string,
  callbacks: {
    onProgress: (status: JobStatus) => void;
    onDone: (status: JobStatus) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const controller = new AbortController();
  const { onProgress, onDone, onError } = callbacks;
  const url = `${API_BASE_URL}/api/text2video/video-jobs/${trackerId}/stream/`;

  (async () => {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${getAccessToken() ?? ''}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Failed to open status stream (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const parseBlock = (block: string): JobStatus | null => {
        const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) return null; // heartbeat / comment lines are ignored
        const raw = dataLine.slice(5).trim();
        if (!raw) return null;
        return JSON.parse(raw) as JobStatus;
      };

      // Returns [isTerminal, lastParsedStatus].
      const processChunk = (chunk: string): [boolean, JobStatus | null] => {
        buffer += chunk;
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        let last: JobStatus | null = null;
        for (const block of blocks) {
          const st = parseBlock(block);
          if (!st) continue;
          last = st;
          onProgress(st);
          if (st.status === 'completed' || st.status === 'failed' || (st.progress ?? 0) >= 100) {
            onDone(st);
            controller.abort();
            return [true, st];
          }
        }
        return [false, last];
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const [isTerminal] = processChunk(decoder.decode(value, { stream: true }));
        if (isTerminal) return;
      }

      // Stream closed cleanly. Flush any remaining buffered block (the final
      // event may have arrived without its trailing blank-line terminator).
      const [flushTerminal, flushLast] = processChunk(buffer);
      if (flushTerminal) return;

      // If the last known status was already terminal, recover it.
      if (flushLast) {
        onProgress(flushLast);
        if (
          flushLast.status === 'completed' ||
          flushLast.status === 'failed' ||
          (flushLast.progress ?? 0) >= 100
        ) {
          onDone(flushLast);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return; // intentional abort, not an error
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => controller.abort();
}

/** Step 3 — fetch the generated scenes (with image_url populated). */
export async function getJobScenes(trackerId: string): Promise<ScenesResponse> {
  return request<ScenesResponse>(`/api/text2video/video-jobs/${trackerId}/scenes/`);
}

/** Step 4 — partially edit a scene. */
export async function patchScene(
  trackerId: string,
  sceneId: number,
  payload: SceneEditPayload
): Promise<SceneDto> {
  return request<SceneDto>(`/api/text2video/video-jobs/${trackerId}/scenes/${sceneId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Step 5 — regenerate one scene's image (optionally with a prompt override). */
export async function regenerateSceneImage(
  sceneId: number,
  promptOverride?: string
): Promise<SceneDto> {
  return request<SceneDto>(`/api/text2video/scenes/${sceneId}/regenerate-image/`, {
    method: 'POST',
    body: JSON.stringify(promptOverride ? { prompt_override: promptOverride } : {}),
  });
}

/** Step 6 — fetch a scene's image (convenience). */
export async function getSceneImage(sceneId: number): Promise<SceneImageResponse> {
  return request<SceneImageResponse>(`/api/text2video/scenes/${sceneId}/image/`);
}

/**
 * Proxied image URL for a scene, streamed through the backend with CORS headers.
 * Use this for canvas drawing (export/preview compositing) so the canvas is not
 * tainted by cross-origin R2 presigned URLs.
 */
export function getSceneImageFileUrl(sceneId: number): string {
  return `${API_BASE_URL}/api/text2video/scenes/${sceneId}/image-file/`;
}

/**
 * True when the given file is an audio file (m4a/mp3/wav/ogg/aac/opus/flac).
 */
export function isAudioFile(file: File): boolean {
  return /\.(mp3|wav|m4a|aac|ogg|opus|flac|webm)$/i.test(file.name);
}

// ---------------------------------------------------------------------------
// Small formatting helpers shared across views
// ---------------------------------------------------------------------------

/** Resolve a relative media path (e.g. /media/upload_jobs/.../source.mp4) to an absolute URL. */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

/** Convert a duration in seconds to a "MM:SS" label. */
export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Convert a duration in seconds to a "MM:SS" or "X.X sec" label. */
export function formatDelta(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(0)} sec`;
  }
  return formatSeconds(seconds);
}

/**
 * Overlay opacity for the generated scene image over the real video at a given
 * playback position within a scene (elapsed = currentTime - scene.startSeconds).
 *
 * Instead of blending video + image 50/50 constantly, the image and the video
 * *alternate* so they "change places": the image fades in to fully cover the
 * video for a moment, then fades out to reveal the real video again. This
 * continues in a repeating cycle for the whole scene.
 *
 * Returns an opacity 0..1. Use `sceneOverlayAlpha(elapsed).alpha === 0` to
 * detect the "video visible" moments, and 1 for the "image visible" moments.
 */
export function sceneOverlayAlpha(elapsed: number): number {
  const FADE = 0.6; // seconds to cross-fade in/out
  const HOLD = 2.4; // seconds the image stays fully visible
  const GAP = 0.6; // seconds the video is fully visible between images
  const p1 = FADE; // image fades in: 0 -> 1
  const p2 = p1 + HOLD; // image holds at 1
  const p3 = p2 + FADE; // image fades out: 1 -> 0
  const P = p3 + GAP; // full cycle period
  const phase = ((elapsed % P) + P) % P;

  if (phase < p1) return phase / FADE; // fade in (video -> image)
  if (phase < p2) return 1; // image only
  if (phase < p3) return 1 - (phase - p2) / FADE; // fade out (image -> video)
  return 0; // video only
}
