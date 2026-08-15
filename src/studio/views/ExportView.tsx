import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheck, IconDownload, IconLoader2, IconVideo } from '@tabler/icons-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { getAccessToken, getSceneImageFileUrl, sceneOverlayAlpha } from '../../lib/api';
import { encodeOffline, isOfflineEncodingSupported } from '../../lib/offlineEncode';
import type { SceneModel } from '../VideoFlowContext';

interface ExportViewProps {
  onDone: () => void;
  onBackToEditor: () => void;
  videoUrl: string | null;
  audioUrl: string | null;
  scenes: SceneModel[];
}

type Phase = 'config' | 'rendering' | 'done';

export function ExportView({
  onDone,
  onBackToEditor,
  videoUrl,
  audioUrl,
  scenes,
}: ExportViewProps) {
  const [phase, setPhase] = useState<Phase>('config');
  const [resolution, setResolution] = useState('1080p');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const rendererCanvas = useRef<HTMLCanvasElement | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);

  // Render the source video on a canvas with the scene-image overlay, recording
  // the result via MediaRecorder into a downloadable webm blob.
  const startRender = useCallback(async () => {
    const hasVideo = !!videoUrl;
    const hasAudio = !!audioUrl;
    if (!hasVideo && !hasAudio) {
      setError('No source file available to export.');
      return;
    }
    const scenesHaveImages = scenes.some((s) => s.imageUrl);
    if (!scenesHaveImages) {
      setError('Some scenes are missing images — regenerate them first, then export.');
      return;
    }

    setPhase('rendering');
    setProgress(0);
    setError(null);

    // ------------------------------------------------------------------
    // Fast path: offline WebCodecs encoding (modern browsers). This runs
    // much faster than real time — "export in seconds". Falls through to
    // the MediaRecorder recording path below if unsupported.
    // ------------------------------------------------------------------
    if (isOfflineEncodingSupported() && (videoUrl || audioUrl)) {
      try {
        const result = await encodeOffline({
          videoUrl,
          audioUrl,
          scenes,
          resolution: resolution as '1080p' | '720p',
          onProgress: setProgress,
        });
        const url = URL.createObjectURL(result.blob);
        setDownloadUrl(url);
        setProgress(100);
        setPhase('done');
        return;
      } catch (err) {
        // Fall back to the real-time MediaRecorder path instead of failing.
        setError(err instanceof Error ? err.message : 'Offline export failed; using fallback.');
        setProgress(0);
      }
    }

    const imageObjectUrls: string[] = [];

    try {
      const canvas = rendererCanvas.current ?? document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D not supported.');

      const loadSceneImage = async (scene: SceneModel): Promise<HTMLImageElement | null> => {
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

            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              return img;
            }
          } catch {
            // Try the next URL source below.
          }
        }

        return null;
      };

      // Preload scene images as same-origin blob URLs so the canvas is not
      // tainted and authenticated backend image proxy requests can succeed.
      const images = await Promise.all(scenes.map((scene) => loadSceneImage(scene)));
      const firstLoadedImage = images.find((img): img is HTMLImageElement => img != null);
      if (!firstLoadedImage) {
        throw new Error('Could not load any scene images for export.');
      }

      // ------------------------------------------------------------------
      // Common setup: dispatch clock + draw a fully-composited frame.
      // ------------------------------------------------------------------

      const sceneDuration = Math.max(
        ...scenes.map((s) => s.endSeconds).filter((v) => Number.isFinite(v)),
        0
      );
      let total = sceneDuration;
      let video: HTMLVideoElement | null = null;
      let audio: HTMLAudioElement | null = null;
      let audioSourceElement: HTMLMediaElement | null = null;

      // Paint one composited frame.
      //  - alternate === true  (video job): the scene image *alternates* with the
      //    real video footage using sceneOverlayAlpha, so the two "change places"
      //    instead of being blended 50/50.
      //  - alternate === false (audio job): there is no real footage, so the
      //    scene image is shown full-screen continuously.
      const drawFrame = (t: number, srcFrame: HTMLVideoElement | null, alternate: boolean) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1) Draw the source (real video) when available.
        if (srcFrame) {
          ctx.drawImage(srcFrame, 0, 0, canvas.width, canvas.height);
        } else {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // 2) Draw the active scene's image over the source.
        const scene =
          scenes.find((s) => t >= s.startSeconds && t < s.endSeconds) ?? scenes[scenes.length - 1];
        const img = scene ? (images[scenes.indexOf(scene)] ?? firstLoadedImage) : firstLoadedImage;
        if (scene && img.naturalWidth > 0) {
          const alpha = alternate ? sceneOverlayAlpha(t - scene.startSeconds) : 1;
          if (alpha > 0) {
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
          }
          // Scene label chip.
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(12, 12, 300, 40);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText(`Scene ${String(scene.number).padStart(2, '0')} · ${scene.title}`, 24, 40);
        }

        setProgress(Math.min(100, total > 0 ? Math.round((t / total) * 100) : 0));
      };

      const waitForMetadata = (el: HTMLMediaElement, message: string) => {
        return new Promise<void>((resolve, reject) => {
          if (Number.isFinite(el.duration) && el.readyState >= 1) {
            resolve();
            return;
          }
          el.onloadedmetadata = () => resolve();
          el.onerror = () => reject(new Error(message));
        });
      };

      const seekToStart = (el: HTMLMediaElement) => {
        return new Promise<void>((resolve) => {
          if (Math.abs(el.currentTime) < 0.01) {
            resolve();
            return;
          }
          el.onseeked = () => resolve();
          el.currentTime = 0;
        });
      };

      const stopRecording = () => {
        const rec = mediaRecRef.current;
        if (rec && rec.state !== 'inactive') {
          rec.stop();
        }
      };

      const playElements: HTMLMediaElement[] = [];

      if (hasAudio && audioUrl) {
        audio = document.createElement('audio');
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.src = audioUrl;
        await waitForMetadata(audio, 'Could not load source audio.');
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          total = Math.max(total, audio.duration);
        }
        audio.currentTime = 0;
        audioSourceElement = audio;
        playElements.push(audio);
      }

      const setupAudioTrack = (stream: MediaStream) => {
        if (!audioSourceElement) return false;

        const AudioContextCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) {
          throw new Error('This browser cannot include audio in the exported video.');
        }

        try {
          const ac = new AudioContextCtor();
          const srcNode = ac.createMediaElementSource(audioSourceElement);
          const dest = ac.createMediaStreamDestination();
          srcNode.connect(dest);
          void ac.resume();
          dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
          return dest.stream.getAudioTracks().length > 0;
        } catch {
          throw new Error('Could not include the audio track in the export.');
        }
      };

      const pickMimeType = (withAudio: boolean) => {
        const candidates = withAudio
          ? [
              'video/webm;codecs=vp9,opus',
              'video/webm;codecs=vp8,opus',
              'video/webm;codecs=opus',
              'video/webm',
            ]
          : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

        return candidates.find(
          (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
        );
      };

      const buildRecorder = (stream: MediaStream) => {
        const hasAudioTrack = stream.getAudioTracks().length > 0;
        const mimeType = pickMimeType(hasAudioTrack);

        if (!mimeType) {
          throw new Error('This browser cannot record video export.');
        }

        const rec = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 8_000_000,
          audioBitsPerSecond: hasAudioTrack ? 192_000 : undefined,
        });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        const stopped = new Promise<void>((resolve) => {
          rec.onstop = () => resolve();
        });
        return { rec, chunks, stopped, mimeType };
      };

      const startPlayback = async () => {
        await Promise.all(playElements.map((el) => el.play()));
      };

      const startLoop = (srcFrame: HTMLVideoElement | null, alternate: boolean) => {
        const clock = srcFrame ?? audio;
        const step = () => {
          const rec = mediaRecRef.current;
          if (!clock || !rec || rec.state === 'inactive') return;

          const t = Math.min(clock.currentTime, total);
          drawFrame(t, srcFrame, alternate);

          if (clock.ended || t >= total) {
            stopRecording();
            return;
          }

          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };

      const onEnded = () => {
        drawFrame(total, video, hasVideo);
        stopRecording();
      };

      audio?.addEventListener('ended', onEnded, { once: true });

      // ------------------------------------------------------------------
      // Explicit, layout-independent render surface.
      //
      // Set the canvas backing-store to the *selected* export resolution so
      // exports stay high-resolution regardless of any CSS-driven layout
      // scaling. 1080p -> 1920x1080, 720p -> 1280x720. The source frame is
      // letterboxed/drawn to fill this surface in drawFrame above.
      // ------------------------------------------------------------------
      const [OUT_W, OUT_H] = resolution === '1080p' ? [1920, 1080] : [1280, 720];
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      // Explicit attributes mirror the backing store; irrelevant for capture
      // (which uses width/height) but keeps the element honest if it is ever
      // mounted into the DOM.
      canvas.setAttribute('width', String(OUT_W));
      canvas.setAttribute('height', String(OUT_H));

      if (hasVideo) {
        video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'auto';
        video.src = videoUrl!;
        await waitForMetadata(video, 'Could not load source video.');

        if (Number.isFinite(video.duration) && video.duration > 0) {
          total = Math.max(total, video.duration);
        }
        await seekToStart(video);
        playElements.unshift(video);
        video.addEventListener('ended', onEnded, { once: true });
        drawFrame(0, video, true);
      } else {
        drawFrame(0, null, false);
      }

      const stream = canvas.captureStream(30);
      const hasRecordedAudio = setupAudioTrack(stream);
      const { rec, chunks, stopped, mimeType } = buildRecorder(stream);
      mediaRecRef.current = rec;

      rec.start(250);

      if (hasVideo) {
        startLoop(video, true);
      } else {
        startLoop(null, false);
      }

      await startPlayback();

      if (!hasVideo && !hasRecordedAudio) {
        throw new Error('Could not include the audio track in the export.');
      }

      // Fallback guard in case an element never fires `ended`.
      window.setTimeout(() => stopRecording(), Math.max(total * 1000 + 500, 1000));

      await stopped;
      video?.pause();
      audio?.pause();
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
      setPhase('done');
    } catch (err) {
      const rec = mediaRecRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stop();
      }
      mediaRecRef.current = null;
      setError(err instanceof Error ? err.message : 'Export failed.');
      setPhase('config');
      setProgress(0);
    } finally {
      imageObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  }, [videoUrl, audioUrl, scenes, resolution]);

  const cleanup = useCallback(() => {
    const rec = mediaRecRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
    mediaRecRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return (
    <Container size={520} py={60}>
      <Stack align="center" gap="lg">
        <Title order={2}>Export Video</Title>

        {error && (
          <Alert color="red" w="100%">
            {error}
          </Alert>
        )}

        {phase === 'config' && (
          <Card withBorder radius="lg" padding="xl" w="100%">
            <Stack gap="lg">
              <Stack gap={6}>
                <Text fw={600}>Resolution</Text>
                <SegmentedControl
                  fullWidth
                  value={resolution}
                  onChange={setResolution}
                  data={[
                    { label: '1080p', value: '1080p' },
                    { label: '720p', value: '720p' },
                  ]}
                />
              </Stack>
              <Stack gap={6}>
                <Text fw={600}>Format</Text>
                <SegmentedControl
                  fullWidth
                  value="webm"
                  onChange={() => undefined}
                  data={[{ label: 'WEBM (recommended)', value: 'webm' }]}
                />
              </Stack>
              <Button
                size="md"
                leftSection={<IconVideo size={18} />}
                onClick={() => void startRender()}
                disabled={(!videoUrl && !audioUrl) || scenes.length === 0}
              >
                Export Video
              </Button>
              <Text c="dimmed" size="xs" ta="center">
                {audioUrl && !videoUrl
                  ? 'Creates a video from your scene images, timed to your uploaded audio, and includes the audio in the export.'
                  : 'Renders the original video with each scene\u2019s generated image alternating with the real footage during its time range.'}
              </Text>
            </Stack>
          </Card>
        )}

        {phase === 'rendering' && (
          <Card withBorder radius="lg" padding="xl" w="100%">
            <Stack align="center" gap="md">
              <ThemeIcon size={56} radius="xl" variant="light" color="violet">
                <IconLoader2 size={28} className="spin" />
              </ThemeIcon>
              <Title order={4}>Rendering...</Title>
              <Progress
                value={progress}
                size="lg"
                radius="xl"
                striped
                animated
                color="violet"
                w="100%"
              />
              <Text c="dimmed" size="sm">
                {Math.round(progress)}% — Compositing your video with scene images.
              </Text>
            </Stack>
          </Card>
        )}

        {phase === 'done' && (
          <Card withBorder radius="lg" padding="xl" w="100%">
            <Stack align="center" gap="md">
              <ThemeIcon size={56} radius="xl" variant="light" color="teal">
                <IconCheck size={28} />
              </ThemeIcon>
              <Title order={4}>Your video is ready</Title>
              <Badge variant="light" size="lg">
                imported-scenes.webm · {resolution} · WEBM
              </Badge>
              <Group>
                {downloadUrl && (
                  <Button
                    component="a"
                    href={downloadUrl}
                    download="imported-scenes.webm"
                    leftSection={<IconDownload size={18} />}
                  >
                    Download Video
                  </Button>
                )}
                <Button variant="subtle" onClick={onBackToEditor}>
                  Back to editor
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
