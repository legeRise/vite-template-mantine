import { API_BASE_URL, getAccessToken, sceneTransitionOpacity, sceneTransitionZoom } from '../../lib/api';
import type { SceneModel } from '../VideoFlowContext';

// Output resolution (mirrors the server exporter's 1280x720 product decision).
export const EXPORT_WIDTH = 1280;
export const EXPORT_HEIGHT = 720;

/** Scene id -> decoded image, ready for canvas drawing. */
export type SceneImageMap = Map<number, ImageBitmap>;

/**
 * Minimal structural type for a decoded video frame so the compositor doesn't
 * need to depend on mediabunny types directly (VideoSample satisfies this).
 */
export interface DrawableVideoFrame {
  draw(
    context: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    dWidth?: number,
    dHeight?: number
  ): void;
}

/**
 * Fetch and decode every scene image once, up front. Images are loaded through
 * the backend's authenticated proxy endpoint (scenes/<id>/image-file/), which
 * always sends CORS headers — so the canvas can never be tainted, regardless
 * of where the underlying media lives (local disk or a legacy remote URL).
 *
 * Scenes whose image fails to load are simply omitted from the map; the frame
 * renderer then skips their overlay (same behaviour as the server exporter).
 */
export async function loadSceneImages(scenes: SceneModel[]): Promise<SceneImageMap> {
  const withImages = scenes.filter((s) => !!s.imageUrl);
  const map: SceneImageMap = new Map();
  const token = getAccessToken() ?? '';

  await Promise.all(
    withImages.map(async (scene) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/text2video/scenes/${scene.id}/image-file/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const blob = await res.blob();
        map.set(scene.id, await createImageBitmap(blob));
      } catch {
        // Missing/unfetchable image -> render the scene without its overlay.
      }
    })
  );

  return map;
}

/** The scene whose [start, end) window contains `time`, or null when the playhead
 * is in an explicit gap between scenes. In those gaps the original video must be
 * visible without any scene-image fallback. */
export function findActiveScene(scenes: SceneModel[], time: number): SceneModel | null {
  for (const scene of scenes) {
    if (time >= scene.startSeconds && time < scene.endSeconds) {
      return scene;
    }
  }
  return null;
}

/**
 * Render ONE output frame at playhead `time`: the source video (or black for
 * audio-only jobs) as the base layer, with the active scene's image overlaid
 * using the exact same transition math as the on-screen preview
 * (sceneTransitionOpacity + sceneTransitionTransform). This is what makes the
 * export WYSIWYG with the editor preview.
 */
export function drawExportFrame(params: {
  ctx: CanvasRenderingContext2D;
  time: number;
  videoFrame: DrawableVideoFrame | null;
  images: SceneImageMap;
  scenes: SceneModel[];
}): void {
  const { ctx, time, videoFrame, images, scenes } = params;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (videoFrame) {
    videoFrame.draw(ctx, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  }

  const scene = findActiveScene(scenes, time);
  const bitmap = scene ? images.get(scene.id) : undefined;
  if (!scene || !bitmap) {
    return;
  }

  const elapsed = Math.max(0, time - scene.startSeconds);
  const duration = Math.max(scene.endSeconds - scene.startSeconds, 0.001);
  const alpha = sceneTransitionOpacity(scene.transition, elapsed, duration);
  if (alpha <= 0) {
    return;
  }

  // Cover-fit the image to the frame (CSS object-fit: cover equivalent).
  const coverScale = Math.max(EXPORT_WIDTH / bitmap.width, EXPORT_HEIGHT / bitmap.height);
  const w = bitmap.width * coverScale;
  const h = bitmap.height * coverScale;

  // Ken Burns zoom pivots around the frame centre, matching the CSS
  // transform-origin: center behaviour of the preview overlay.
  const zoom = sceneTransitionZoom(elapsed, duration);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(EXPORT_WIDTH / 2, EXPORT_HEIGHT / 2);
  ctx.scale(zoom, zoom);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  ctx.restore();
}
