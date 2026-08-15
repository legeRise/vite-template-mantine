/**
 * Offline, non-realtime video export using WebCodecs + mediabunny.
 *
 * Unlike the real-time MediaRecorder path (which records at wall-clock
 * speed via canvas.captureStream), this pipeline encodes frames as fast
 * as the encoder allows — "export in seconds" instead of "export in
 * real time".
 *
 * It is only used when the browser supports WebCodecs (VideoEncoder,
 * VideoFrame) — otherwise the caller falls back to MediaRecorder.
 *
 * Mediabunny provides the WebM muxing and handles WebCodecs encoding of
 * both the composited video frames and (optionally) the decoded audio.
 */

import {
  AudioBufferSource,
  BufferTarget,
  Output,
  VideoSampleSource,
  VideoSample,
  WebMOutputFormat,
  QUALITY_HIGH,
  type VideoCodec,
} from 'mediabunny';
import { getAccessToken, getSceneImageFileUrl, sceneOverlayAlpha } from './api';

/** Number of frames encoded per second of media. */
const FPS = 30;
/** Target video codec. VP9 is well supported by WebCodecs and WebM. */
const VIDEO_CODEC: VideoCodec = 'vp9';
/** Audio codec for WebM. */
const AUDIO_CODEC = 'opus' as const;

/** Result of a successful offline encode. */
export interface OfflineEncodeResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

/** True when the browser exposes the WebCodecs APIs we need. */
export function isOfflineEncodingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined' &&
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame !== 'undefined' &&
    typeof (window as unknown as { AudioDecoder?: unknown }).AudioDecoder !== 'undefined'
  );
}

interface RenderSceneLike {
  id: number;
  number: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  imageUrl: string | null;
}

export interface OfflineEncodeParams {
  /** URL of the source video (may be null for audio-only jobs). */
  videoUrl: string | null;
  /** URL of the source audio (may be null). */
  audioUrl: string | null;
  /** The scenes with their generated images. */
  scenes: RenderSceneLike[];
  /** Desired export resolution. */
  resolution: '1080p' | '720p';
  /** Progress callback, 0..100. */
  onProgress: (pct: number) => void;
}

export interface OfflineEncodeSharedInputs {
  onProgress: (pct: number) => void;
  /** Scenes with resolved <img> elements (same order as `scenes`). */
  images: HTMLImageElement[];
  /** Fallback image when a scene has no image. */
  firstImage: HTMLImageElement;
  resolution: '1080p' | '720p';
}

/**
 * Decode an audio URL into an AudioBuffer using the Web Audio API.
 * Returns null if decoding fails or no audio URL is given.
 */
async function decodeAudio(url: string | null): Promise<AudioBuffer | null> {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const arrayBuf = await res.arrayBuffer();
  const ACtor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  // AudioContext may require a user gesture in some browsers; the exporter
  // is invoked on a click, so `resume()` will typically be allowed.
  const ac = new ACtor();
  try {
    const buf = await ac.decodeAudioData(arrayBuf);
    await ac.close();
    return buf;
  } catch {
    await ac.close().catch(() => undefined);
    return null;
  }
}

/**
 * The main offline encoder.
 *
 * @returns A Blob containing the encoded WebM, or throws if encoding fails.
 */
export async function encodeOffline(params: OfflineEncodeParams): Promise<OfflineEncodeResult> {
  const { videoUrl, audioUrl, scenes, resolution, onProgress } = params;

  const [OUT_W, OUT_H] = resolution === '1080p' ? [1920, 1080] : [1280, 720];

  // ------------------------------------------------------------------
  // 1. Load source video element (for frame rendering) and images.
  // ------------------------------------------------------------------
  let video: HTMLVideoElement | null = null;
  if (videoUrl) {
    video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.src = videoUrl;
    await new Promise<void>((resolve, reject) => {
      if (Number.isFinite(video!.duration) && video!.readyState >= 1) {
        resolve();
        return;
      }
      video!.onloadedmetadata = () => resolve();
      video!.onerror = () => reject(new Error('Could not load source video for export.'));
    });
  }

  // Load each scene image as a cross-origin safe element.
  const imageObjectUrls: string[] = [];
  const loadSceneImage = async (scene: RenderSceneLike): Promise<HTMLImageElement | null> => {
    if (!scene.imageUrl) return null;
    const urls = scene.id ? [getSceneImageFileUrl(scene.id), scene.imageUrl] : [scene.imageUrl];
    const token = getAccessToken();
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers:
            token && url === getSceneImageFileUrl(scene.id)
              ? { Authorization: `Bearer ${token}` }
              : undefined,
        });
        if (!res.ok) continue;
        const blobUrl = URL.createObjectURL(await res.blob());
        imageObjectUrls.push(blobUrl);
        const img = new Image();
        img.src = blobUrl;
        await img.decode();
        if (img.naturalWidth > 0 && img.naturalHeight > 0) return img;
      } catch {
        // try next source
      }
    }
    return null;
  };

  const images = await Promise.all(scenes.map(loadSceneImage));
  const firstImage = images.find((i): i is HTMLImageElement => i != null);
  if (!firstImage) {
    imageObjectUrls.forEach((u) => URL.revokeObjectURL(u));
    throw new Error('Could not load any scene images for export.');
  }

  imageObjectUrls.forEach((u) => URL.revokeObjectURL(u));

  // Total duration (max of scene end time and media durations).
  const sceneDuration = Math.max(
    ...scenes.map((s) => s.endSeconds).filter((v) => Number.isFinite(v)),
    0
  );
  let total = sceneDuration;
  if (video && Number.isFinite(video.duration)) total = Math.max(total, video.duration);
  if (total <= 0) {
    throw new Error('Nothing to export: the media has no duration.');
  }

  // ------------------------------------------------------------------
  // 2. Capability + setup mediabunny pipeline.
  // ------------------------------------------------------------------
  if (!isOfflineEncodingSupported()) {
    throw new Error('Offline encoding is not supported in this browser.');
  }

  const vSrc = new VideoSampleSource({ codec: VIDEO_CODEC, quality: QUALITY_HIGH });
  const audioBuf = await decodeAudio(audioUrl);
  let aSrc: AudioBufferSource | null = null;
  if (audioBuf && audioBuf.duration > 0) {
    aSrc = new AudioBufferSource({ codec: AUDIO_CODEC, quality: QUALITY_HIGH });
    total = Math.max(total, audioBuf.duration);
  }

  const muxer = new WebMOutputFormat();
  const target = new BufferTarget();
  const output = new Output({ format: muxer, target });

  if (aSrc) output.addAudioTrack(aSrc, {});
  if (vSrc) output.addVideoTrack(vSrc, {});

  await output.start();

  // ------------------------------------------------------------------
  // 3. Compositing canvas.
  // ------------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  canvas.setAttribute('width', String(OUT_W));
  canvas.setAttribute('height', String(OUT_H));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported.');

  const sceneIndex = (scene: RenderSceneLike) => scenes.indexOf(scene);

  const drawFrame = (t: number, srcFrame: HTMLVideoElement | null, alternate: boolean) => {
    ctx.clearRect(0, 0, OUT_W, OUT_H);
    if (srcFrame) {
      ctx.drawImage(srcFrame, 0, 0, OUT_W, OUT_H);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OUT_W, OUT_H);
    }
    const scene =
      scenes.find((s) => t >= s.startSeconds && t < s.endSeconds) ?? scenes[scenes.length - 1];
    const img = scene ? images[sceneIndex(scene)] ?? firstImage : firstImage;
    if (scene && img.naturalWidth > 0) {
      const alpha = alternate ? sceneOverlayAlpha(t - scene.startSeconds) : 1;
      if (alpha > 0) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, 0, 0, OUT_W, OUT_H);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(12, 12, 300, 40);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`Scene ${String(scene.number).padStart(2, '0')} · ${scene.title}`, 24, 40);
    }
  };

  // ------------------------------------------------------------------
  // 4. Encode all frames (offline, fast) + audio.
  // ------------------------------------------------------------------
  try {
    // Encode audio first so timestamps line up.
    if (aSrc && audioBuf) {
      await aSrc.add(audioBuf);
    }

    const frameMs = 1000 / FPS;
    const frameCount = Math.ceil((total * 1000) / frameMs);

    // Seek source video to the exact frame time before drawing.
    const seekTo = (el: HTMLVideoElement, t: number) =>
      new Promise<void>((resolve) => {
        if (Math.abs(el.currentTime - t) < 0.001) {
          resolve();
          return;
        }
        const done = () => {
          el.onseeked = null;
          resolve();
        };
        el.onseeked = done;
        el.currentTime = t;
      });

    for (let i = 0; i < frameCount; i++) {
      const t = Math.min((i * frameMs) / 1000, total);
      if (video) await seekTo(video, t);

      drawFrame(t, video, !!videoUrl);

      // Create a VideoSample from the canvas. Mediabunny wraps this into
      // a VideoFrame when available (zero-copy-ish) and encodes it.
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(canvas);
      } catch {
        // Fallback: draw canvas to an offscreen image source.
        const off = document.createElement('canvas');
        off.width = OUT_W;
        off.height = OUT_H;
        const octx = off.getContext('2d');
        if (!octx) throw new Error('Canvas 2D not supported.');
        octx.drawImage(canvas, 0, 0);
        bitmap = (await createImageBitmap(off)) as ImageBitmap;
      }

      const sample = new VideoSample(bitmap, {
        timestamp: t,
        duration: frameMs / 1000,
      });
      await vSrc.add(sample);
      sample.close();
      bitmap.close();

      onProgress(Math.min(100, Math.round(((i + 1) / frameCount) * 100)));
    }
  } catch (err) {
    await output.finalize().catch(() => undefined);
    throw err instanceof Error ? err : new Error('Offline export failed.');
  }

  await output.finalize();

  if (!target.buffer || target.buffer.byteLength === 0) {
    throw new Error('Export produced an empty file.');
  }

  return {
    blob: new Blob([target.buffer], { type: 'video/webm' }),
    mimeType: 'video/webm',
    durationSeconds: total,
  };
}
