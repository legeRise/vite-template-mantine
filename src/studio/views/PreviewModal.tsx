import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconArrowLeft,
  IconArrowRight,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Slider,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { formatSeconds, sceneTransitionOpacity } from '../../lib/api';
import type { SceneModel } from '../VideoFlowContext';

interface PreviewModalProps {
  opened: boolean;
  onClose: () => void;
  activeScene: SceneModel;
  scenes: SceneModel[];
  videoUrl: string | null;
  audioUrl: string | null;
  mode: 'scene' | 'full';
}

/**
 * Plays either one scene or the full source media and automatically swaps which
 * scene's generated image + label is shown based on the current playhead
 * position.
 *
 *  - Video source: the original video plays; the active scene's image is
 *    overlaid, alternating with the real video (they "change places") rather
 *    than being blended 50/50.
 *  - Audio source: an image slideshow is driven by the audio's playhead.
 */
export function PreviewModal({
  opened,
  onClose,
  activeScene,
  scenes,
  videoUrl,
  audioUrl,
  mode,
}: PreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(activeScene.startSeconds);
  const [previewScene, setPreviewScene] = useState(activeScene);

  const isAudio = !videoUrl && !!audioUrl;
  const hasMedia = !!videoUrl || isAudio;

  useEffect(() => {
    setPreviewScene(activeScene);
  }, [activeScene]);

  const scenesEnd = Math.max(
    ...scenes.map((s) => s.endSeconds).filter((v) => Number.isFinite(v)),
    activeScene.endSeconds,
    0
  );
  const previewStart = mode === 'scene' ? previewScene.startSeconds : 0;
  const previewEnd = mode === 'scene' ? previewScene.endSeconds : scenesEnd;
  const previewDuration = Math.max(previewEnd - previewStart, 0);

  const pauseMedia = useCallback(() => {
    videoRef.current?.pause();
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const syncMediaTo = useCallback(
    (target: number) => {
      const t = Number.isFinite(target) ? target : 0;
      if (isAudio) {
        const a = audioRef.current;
        if (a) a.currentTime = t;
      } else {
        const v = videoRef.current;
        if (v) v.currentTime = t;
      }
      setCurrentTime(t);
    },
    [isAudio]
  );

  useEffect(() => {
    if (opened) {
      pauseMedia();
      syncMediaTo(previewStart);
    }
  }, [opened, pauseMedia, previewStart, syncMediaTo]);

  // Only render a scene overlay when the playhead is actually inside a scene.
  // Empty gaps must show the raw video rather than falling back to the last
  // scene image across the entire remaining space.
  const overlayScene = scenes.find((s) => currentTime >= s.startSeconds && currentTime < s.endSeconds) ?? null;
  const overlaySceneForLabel = overlayScene ?? activeScene;

  const onPlayhead = useCallback(
    (t: number) => {
      if (mode === 'scene' && t >= previewEnd) {
        syncMediaTo(previewEnd);
        pauseMedia();
        return;
      }
      setCurrentTime(t);
    },
    [mode, pauseMedia, previewEnd, syncMediaTo]
  );

  const togglePlay = useCallback(() => {
    if (isAudio) {
      const a = audioRef.current;
      if (!a) return;
      if (a.paused) {
        void a.play();
        setPlaying(true);
      } else {
        a.pause();
        setPlaying(false);
      }
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [isAudio]);

  // Jump the playhead to the start of a scene.
  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(scenes.length - 1, nextIndex));
      const targetScene = scenes[clamped];
      const target = targetScene?.startSeconds ?? 0;
      if (targetScene && mode === 'scene') {
        setPreviewScene(targetScene);
      }
      syncMediaTo(target);
    },
    [mode, scenes, syncMediaTo]
  );

  const seekTo = useCallback(
    (offset: number) => {
      syncMediaTo(previewStart + offset);
    },
    [previewStart, syncMediaTo]
  );

  // Overlay opacity: the scene's frame covers the footage for exactly its
  // [start, end] window, shaped by that scene's transition (same math as the
  // inline preview and the browser export — WYSIWYG everywhere).
  const overlayAlpha = overlayScene?.imageUrl
    ? sceneTransitionOpacity(
        overlayScene.transition,
        currentTime - overlayScene.startSeconds,
        overlayScene.endSeconds - overlayScene.startSeconds
      )
    : 0;
  const currentSceneForControls = mode === 'scene' ? previewScene : overlayScene ?? activeScene;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        pauseMedia();
        onClose();
      }}
      size={760}
      title={mode === 'scene' ? 'Scene Preview' : 'Full Preview'}
      centered
    >
      <Stack gap="lg">
        {/* Media / image area */}
        <Box
          pos="relative"
          style={{
            aspectRatio: '16 / 9',
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          }}
        >
          {isAudio ? (
            /* Audio-only: show the active scene image while the audio playhead runs. */
            <>
              <Box
                h="100%"
                w="100%"
                style={{
                  background: overlayScene?.imageUrl
                    ? `#000 url(${overlayScene.imageUrl}) center / cover no-repeat`
                    : '#000',
                }}
              />
              <audio
                ref={audioRef}
                src={audioUrl ?? undefined}
                style={{ display: 'none' }}
                onTimeUpdate={(e) => onPlayhead(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            </>
          ) : videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              onTimeUpdate={(e) => onPlayhead(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          ) : (
            <Box
              h="100%"
              w="100%"
              style={{
                background: 'var(--ez-accent-dim)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ThemeIcon variant="light" radius="xl" size={64}>
                <IconPhoto size={28} />
              </ThemeIcon>
            </Box>
          )}

          {/* Overlay — video source only. The scene image alternates with the
              real video (image fully visible, then video fully visible) instead
              of being blended 50/50. */}
          {videoUrl && overlayScene?.imageUrl && (
            <Box
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              <img
                src={overlayScene.imageUrl}
                alt={overlayScene.title}
                style={{
                  height: '100%',
                  width: '100%',
                  objectFit: 'cover',
                  opacity: overlayAlpha,
                }}
              />
            </Box>
          )}

          {/* Scene label chip — always reflects the playhead's scene. */}
          {hasMedia && (
            <Box
              style={{
                position: 'absolute',
                left: 12,
                top: 12,
                borderRadius: 'var(--mantine-radius-md)',
                padding: '6px 12px',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                color: '#fff',
                zIndex: 2,
              }}
            >
              <Group gap="xs" align="center">
                <Badge variant="filled" color="brand" size="sm" className="ez-timecode">
                  Scene {String(overlaySceneForLabel.number).padStart(2, '0')}
                </Badge>
                <Text fw={600} size="sm" style={{ lineClamp: 1 }}>
                  {overlaySceneForLabel.title}
                </Text>
              </Group>
            </Box>
          )}

          {hasMedia && (
            <Box
              style={{
                position: 'absolute',
                right: 12,
                top: 12,
                borderRadius: 'var(--mantine-radius-md)',
                padding: '5px 10px',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                color: '#fff',
                fontSize: 12,
                zIndex: 2,
              }}
            >
              {isAudio ? 'Audio slideshow' : overlayScene && overlayAlpha > 0.5 ? 'Image' : 'Video'}
            </Box>
          )}
        </Box>

        {/* Transport controls */}
        <Group justify="center" gap="md">
          <ActionIcon
            variant="light"
            size="lg"
            onClick={() => goTo(scenes.indexOf(currentSceneForControls) - 1)}
            aria-label="Previous scene"
          >
            <IconArrowLeft size={20} />
          </ActionIcon>

          {hasMedia ? (
            <Button
              variant="filled"
              leftSection={playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
              onClick={togglePlay}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
          ) : (
            <Button
              variant="filled"
              leftSection={<IconPlayerPlay size={16} />}
              onClick={() => goTo(scenes.indexOf(currentSceneForControls) + 1)}
            >
              Next scene
            </Button>
          )}

          <ActionIcon
            variant="light"
            size="lg"
            onClick={() => goTo(scenes.indexOf(currentSceneForControls) + 1)}
            aria-label="Next scene"
          >
            <IconArrowRight size={20} />
          </ActionIcon>
        </Group>

        {/* Seek bar */}
        <Stack gap="xs">
          <Slider
            value={
              hasMedia && previewDuration
                ? ((currentTime - previewStart) / previewDuration) * 100
                : 0
            }
            onChange={(pct) => seekTo((pct / 100) * previewDuration)}
            min={0}
            max={100}
            label={(v) => formatSeconds(previewStart + (v / 100) * previewDuration)}
          />
          <Group justify="space-between">
            <Text size="sm" c="dimmed" className="ez-timecode">
              {formatSeconds(currentTime)}
            </Text>
            <Text size="sm" fw={600}>
              Scene {String(overlaySceneForLabel.number).padStart(2, '0')} · {overlaySceneForLabel.title}
            </Text>
            <Text size="sm" c="dimmed" className="ez-timecode">
              {formatSeconds(previewEnd)}
            </Text>
          </Group>
        </Stack>

        {videoUrl && overlayScene?.imageUrl && (
          <Text c="dimmed" size="xs" ta="center">
            {overlayAlpha > 0.5 ? 'Showing generated image…' : 'Showing original video…'}
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
