import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  UrlSource,
  VideoSampleSink,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import type { SceneModel } from '../VideoFlowContext';
import { EXPORT_HEIGHT, EXPORT_WIDTH, drawExportFrame, loadSceneImages } from './compositor';

// Audio-only jobs render at a lower frame rate — no fast motion on screen, and
// it is friendlier to encode time / file size (mirrors the server exporter).
const AUDIO_ONLY_FPS = 16;

export class BrowserExportError extends Error {}

/** Thrown when the user cancels; callers should treat it as a normal exit. */
export class BrowserExportCanceledError extends Error {}

export interface BrowserExportOptions {
  videoUrl: string | null;
  audioUrl: string | null;
  scenes: SceneModel[];
  /** 0-100 plus a human-readable status line. */
  onProgress?: (pct: number, message: string) => void;
  /** Polled between frames; return true to abort the render. */
  shouldCancel?: () => boolean;
}

/**
 * Cheap capability probe for the UI: can this browser hardware-encode H.264
 * at the export resolution? Does not touch any media.
 */
export async function checkBrowserExportSupport(): Promise<boolean> {
  try {
    return await canEncodeVideo('avc', { width: EXPORT_WIDTH, height: EXPORT_HEIGHT });
  } catch {
    return false;
  }
}

/**
 * Render the project entirely in the browser using WebCodecs (via mediabunny)
 * and resolve with a finished MP4 blob. No server involvement.
 *
 * Pipeline:
 *   1. Decode the source video frame-by-frame (hardware accelerated).
 *   2. Composite each frame on a 1280x720 canvas with the scene overlay math
 *      shared with the editor preview (WYSIWYG).
 *   3. Encode with the browser's H.264 encoder and mux to MP4.
 *   4. Audio is copied over as-is when possible (no re-encode), falling back
 *      to decode + re-encode only when the container can't take the codec.
 */
export async function exportProjectInBrowser(options: BrowserExportOptions): Promise<Blob> {
  const { videoUrl, audioUrl, scenes, onProgress, shouldCancel } = options;
  if (!videoUrl && !audioUrl) {
    throw new BrowserExportError('No source video or audio available to export.');
  }

  const throwIfCanceled = () => {
    if (shouldCancel?.()) {
      throw new BrowserExportCanceledError('Export canceled.');
    }
  };

  const report = (pct: number, message: string) => onProgress?.(Math.min(pct, 99.5), message);

  // ------------------------------------------------------------------
  // 1. Assets: preload scene images, open the source media.
  // ------------------------------------------------------------------
  report(0, 'Loading scene images…');
  const images = await loadSceneImages(scenes);
  throwIfCanceled();

  const sourceUrl = videoUrl ?? (audioUrl as string);
  const input = new Input({ source: new UrlSource(sourceUrl), formats: ALL_FORMATS });
  const [videoTrack, sourceAudioTrack] = await Promise.all([
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
  ]);

  const lastSceneEnd = scenes.reduce((max, s) => Math.max(max, s.endSeconds), 0);
  const primaryTrack = videoTrack ?? sourceAudioTrack;
  if (!primaryTrack) {
    throw new BrowserExportError('The source file has no playable video or audio track.');
  }
  const mediaDuration = await primaryTrack.computeDuration();
  const totalDuration = Math.max(lastSceneEnd, mediaDuration);
  if (!(totalDuration > 0)) {
    throw new BrowserExportError('Could not determine the length of the source media.');
  }

  // ------------------------------------------------------------------
  // 2. Output wiring: MP4 -> H.264 canvas encoder + best-effort audio.
  // ------------------------------------------------------------------
  if (!(await canEncodeVideo('avc', { width: EXPORT_WIDTH, height: EXPORT_HEIGHT }))) {
    throw new BrowserExportError(
      "This browser can't encode H.264 video. Use the server export instead."
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new BrowserExportError('Could not create a rendering canvas.');
  }

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const canvasSource = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
  output.addVideoTrack(canvasSource);

  // Decide the audio strategy BEFORE starting the muxer: packet-copy when the
  // source codec fits MP4 (fast, lossless), else decode + re-encode to the
  // first codec this browser can produce that MP4 accepts.
  let audioPump: (() => Promise<void>) | null = null;
  if (sourceAudioTrack) {
    audioPump = await planAudioTrack(output, sourceAudioTrack);
  }

  await output.start();

  // ------------------------------------------------------------------
  // 3. Render loop(s). Video frames and audio packets are pumped
  //    concurrently; awaiting each add() respects encoder backpressure.
  // ------------------------------------------------------------------
  const renderVideo = async () => {
    if (videoTrack) {
      await pumpVideoFrames({
        videoTrack,
        totalDuration,
        ctx,
        canvasSource,
        images,
        scenes,
        throwIfCanceled,
        report,
      });
    } else {
      await pumpSyntheticFrames({
        totalDuration,
        ctx,
        canvasSource,
        images,
        scenes,
        throwIfCanceled,
        report,
      });
    }
    canvasSource.close();
  };

  try {
    await Promise.all([renderVideo(), audioPump ? audioPump() : Promise.resolve()]);
    report(100, 'Finalizing…');
    await output.finalize();
  } catch (err) {
    // Release the muxer/encoder resources on cancel or failure.
    await output.cancel().catch(() => undefined);
    throw err;
  }

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) {
    throw new BrowserExportError('Rendering produced no data.');
  }
  return new Blob([buffer], { type: 'video/mp4' });
}

// ----------------------------------------------------------------------
// Audio strategy
// ----------------------------------------------------------------------

/**
 * Attach an audio track to `output` and return the coroutine that feeds it.
 * Returns null when there is no usable audio path (the export then proceeds
 * as a silent video rather than failing outright).
 */
async function planAudioTrack(
  output: Output<Mp4OutputFormat, BufferTarget>,
  track: InputAudioTrack
): Promise<(() => Promise<void>) | null> {
  const supportedCodecs = output.format.getSupportedAudioCodecs();
  const sourceCodec = await track.getCodec();

  // Fast path: copy the already-encoded packets straight into the MP4.
  if (sourceCodec && supportedCodecs.includes(sourceCodec)) {
    const packetSource = new EncodedAudioPacketSource(sourceCodec);
    output.addAudioTrack(packetSource);
    return async () => {
      const sink = new EncodedPacketSink(track);
      const decoderConfig = await track.getDecoderConfig();
      const meta = { decoderConfig: decoderConfig ?? undefined };
      for await (const packet of sink.packets()) {
        await packetSource.add(packet, meta);
      }
      packetSource.close();
    };
  }

  // Fallback: decode to AudioBuffers and re-encode with whatever codec this
  // browser can produce that the MP4 muxer accepts (usually AAC, else Opus).
  if (!(await track.canDecode())) {
    return null;
  }
  const transcodeCodec = await getFirstEncodableAudioCodec(supportedCodecs, {
    numberOfChannels: track.numberOfChannels,
    sampleRate: track.sampleRate,
  });
  if (!transcodeCodec) {
    return null;
  }

  const bufferSource = new AudioBufferSource({ codec: transcodeCodec, bitrate: QUALITY_HIGH });
  output.addAudioTrack(bufferSource);
  return async () => {
    const sink = new AudioBufferSink(track);
    for await (const { buffer } of sink.buffers()) {
      await bufferSource.add(buffer);
    }
    bufferSource.close();
  };
}

// ----------------------------------------------------------------------
// Frame pumps
// ----------------------------------------------------------------------

interface PumpParams {
  totalDuration: number;
  ctx: CanvasRenderingContext2D;
  canvasSource: CanvasSource;
  images: Map<number, ImageBitmap>;
  scenes: SceneModel[];
  throwIfCanceled: () => void;
  report: (pct: number, message: string) => void;
}

/** Video jobs: iterate the source's real frames — no dropped/duplicated frames. */
async function pumpVideoFrames(
  params: PumpParams & { videoTrack: InputVideoTrack }
): Promise<void> {
  const { videoTrack, totalDuration, ctx, canvasSource, images, scenes, throwIfCanceled, report } =
    params;

  // Estimate a sane per-frame duration for streams whose samples lack one.
  const stats = await videoTrack.computePacketStats(100);
  const fallbackFrameDuration = stats.averagePacketRate > 0 ? 1 / stats.averagePacketRate : 1 / 24;

  const sink = new VideoSampleSink(videoTrack);
  for await (const sample of sink.samples(0, totalDuration)) {
    throwIfCanceled();
    drawExportFrame({
      ctx,
      time: sample.timestamp,
      videoFrame: sample,
      images,
      scenes,
    });
    await canvasSource.add(sample.timestamp, sample.duration || fallbackFrameDuration);
    sample.close();
    report((sample.timestamp / totalDuration) * 100, 'Rendering video…');
  }
}

/** Audio-only jobs: synthesize slideshow frames at a fixed low frame rate. */
async function pumpSyntheticFrames(params: PumpParams): Promise<void> {
  const { totalDuration, ctx, canvasSource, images, scenes, throwIfCanceled, report } = params;
  const frameDuration = 1 / AUDIO_ONLY_FPS;

  for (let t = 0; t < totalDuration; t += frameDuration) {
    throwIfCanceled();
    drawExportFrame({ ctx, time: t, videoFrame: null, images, scenes });
    await canvasSource.add(t, frameDuration);
    report((t / totalDuration) * 100, 'Rendering slideshow…');
  }
}
