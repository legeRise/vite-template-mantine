import { useEffect, useRef, useState } from 'react';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconEye,
  IconFileText,
  IconMovie,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconPlayerPause,
  IconPlayerPlay,
  IconVideo,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Container,
  Group,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { formatDelta } from '../../lib/api';
import { useVideoFlow, type SceneModel } from '../VideoFlowContext';

/** Build a plain-text document of all scene topics and download it. */
export function downloadSceneTopics(scenes: SceneModel[]) {
  const lines: string[] = [];
  lines.push(`EZ-CLIP — VIDEO TO SCENE TOPICS`);
  lines.push(`Total scenes: ${scenes.length}`);
  lines.push('');

  scenes.forEach((s) => {
    lines.push(`========== SCENE ${String(s.number).padStart(2, '0')} ==========`);
    lines.push(`Title: ${s.title}`);
    lines.push(`Time:   ${s.start} – ${s.end} (${formatDelta(s.endSeconds - s.startSeconds)})`);
    if (s.description) lines.push(`Description: ${s.description}`);
    if (s.narration) lines.push(`Narration:   ${s.narration}`);
    if (s.prompt) lines.push(`Image prompt: ${s.prompt}`);
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'scene-topics.txt';
  a.click();
  URL.revokeObjectURL(url);
}

interface EditorViewProps {
  scenes: SceneModel[];
  onBack: () => void;
  onOpenPreview: () => void;
  onOpenExport: () => void;
}

export function EditorView({ scenes, onBack, onOpenPreview, onOpenExport }: EditorViewProps) {
  const { addScene } = useVideoFlow();
  const [activeId, setActiveId] = useState<number>(scenes[0]?.id ?? 1);
  const [addingScene, setAddingScene] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const active = scenes.find((s) => s.id === activeId) ?? scenes[0];

  const handleAddScene = async () => {
    setAddingScene(true);
    setAddError(null);
    try {
      const newScene = await addScene();
      setActiveId(newScene.id);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add scene');
    } finally {
      setAddingScene(false);
    }
  };

  return (
    <Stack gap={0} style={{ minHeight: '100vh' }} bg="var(--app-bg)">
      {/* Top bar */}
      <Group
        justify="space-between"
        px="lg"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group>
          <ActionIcon variant="subtle" onClick={onBack} aria-label="Back">
            <IconArrowLeft size={18} />
          </ActionIcon>
          <IconVideo size={20} color="var(--mantine-color-violet-6)" />
          <Text fw={700}>My Video</Text>
        </Group>
        <Group>
          <Button
            variant="light"
            leftSection={<IconFileText size={16} />}
            onClick={() => downloadSceneTopics(scenes)}
          >
            Download Topics
          </Button>
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() => void handleAddScene()}
            loading={addingScene}
          >
            Add Scene
          </Button>
          <Button variant="light" leftSection={<IconEye size={16} />} onClick={onOpenPreview}>
            Full Preview
          </Button>
          <Button leftSection={<IconDownload size={16} />} onClick={onOpenExport}>
            Export
          </Button>
        </Group>
      </Group>

      {addError && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} m="md">
          {addError}
        </Alert>
      )}

      {/* Timeline */}
      <Paper
        p="lg"
        radius={0}
        bg="var(--mantine-color-dark-6)"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Timeline
            </Text>
            <Group gap="xs">
              <Badge variant="light" size="sm">
                {scenes.length} scenes
              </Badge>
            </Group>
          </Group>
          <Group
            gap="md"
            align="stretch"
            wrap="nowrap"
            style={{ overflowX: 'auto', paddingBottom: 8 }}
          >
            {scenes.map((scene) => (
              <TimelineCard
                key={scene.id}
                scene={scene}
                active={scene.id === active.id}
                onClick={() => setActiveId(scene.id)}
              />
            ))}
          </Group>
        </Stack>
      </Paper>

      {/* Detail panel */}
      {active && (
        <Container size={760} py="xl">
          <SceneEditor key={active.id} scene={active} />
        </Container>
      )}
    </Stack>
  );
}

function TimelineCard({
  scene,
  active,
  onClick,
}: {
  scene: SceneModel;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      withBorder
      radius="md"
      padding={0}
      style={{
        width: 120,
        flexShrink: 0,
        cursor: 'pointer',
        borderColor: active ? 'var(--mantine-color-violet-5)' : undefined,
        borderWidth: active ? 2 : 1,
        overflow: 'hidden',
      }}
      onClick={onClick}
    >
      <Box
        style={{
          height: 68,
          background: scene.imageUrl
            ? `url(${scene.imageUrl}) center / cover`
            : 'var(--mantine-color-violet-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {!scene.imageUrl && (
          <ThemeIcon variant="light" radius="xl" size={28}>
            <IconPhoto size={16} />
          </ThemeIcon>
        )}
      </Box>
      <Stack gap={2} p="xs" bg="var(--mantine-color-body)">
        <Text size="sm" fw={600}>
          Scene {String(scene.number).padStart(2, '0')}
        </Text>
        <Text size="xs" c="dimmed">
          {scene.start} · {formatDelta(scene.endSeconds - scene.startSeconds)}
        </Text>
      </Stack>
    </Card>
  );
}

function SceneEditor({ scene }: { scene: SceneModel }) {
  const { updateScene, regenerateImage, videoUrl, audioUrl } = useVideoFlow();
  const [title, setTitle] = useState(scene.title);
  const [prompt, setPrompt] = useState(scene.prompt);
  const [startSeconds, setStartSeconds] = useState<number | string>(scene.startSeconds);
  const [endSeconds, setEndSeconds] = useState<number | string>(scene.endSeconds);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  const save = async () => {
    const start = typeof startSeconds === 'number' ? startSeconds : Number(startSeconds);
    const end = typeof endSeconds === 'number' ? endSeconds : Number(endSeconds);

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      setError('Set a valid scene time range. End time must be after start time.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateScene(scene.id, {
        scene_title: title,
        image_prompt: prompt,
        start,
        end,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scene');
    } finally {
      setSaving(false);
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => setSaved(false), 2500);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      await regenerateImage(scene.id, prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate image');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap={6} style={{ flex: 1 }}>
          <Title order={3}>Scene {String(scene.number).padStart(2, '0')}</Title>
          <Text c="dimmed" size="sm">
            {scene.start} — {scene.end} · {formatDelta(scene.endSeconds - scene.startSeconds)}
          </Text>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            label="Scene title"
            mt="sm"
          />
          <NumberInput
            value={startSeconds}
            onChange={setStartSeconds}
            label="Start"
            suffix=" sec"
            min={0}
            decimalScale={2}
            clampBehavior="strict"
          />
          <NumberInput
            value={endSeconds}
            onChange={setEndSeconds}
            label="End"
            suffix=" sec"
            min={0}
            decimalScale={2}
            clampBehavior="strict"
          />
        </Stack>
        <Badge
          variant={scene.edited ? 'filled' : 'light'}
          size="lg"
          color={scene.edited ? 'teal' : 'gray'}
        >
          {scene.edited ? `Edited · ${scene.regenerateCount} regen` : 'Generated'}
        </Badge>
      </Group>

      {/* Audio/video sync player — set the scene's start/end to the playhead
          so you can hear exactly where the scene should begin and end. */}
      <AudioSyncTiming
        videoUrl={videoUrl}
        audioUrl={audioUrl}
        startSeconds={startSeconds}
        endSeconds={endSeconds}
        onSetStart={(sec) => setStartSeconds(sec)}
        onSetEnd={(sec) => setEndSeconds(sec)}
        sceneDurationSec={formatDelta(scene.endSeconds - scene.startSeconds)}
      />

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      )}

      {/* Generated image */}
      <Card withBorder radius="lg" padding="md">
        <Stack gap="md">
          <Box
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: 'var(--mantine-radius-md)',
              background: scene.imageUrl
                ? `url(${scene.imageUrl}) center / cover`
                : 'var(--mantine-color-violet-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {!scene.imageUrl && (
              <Center style={{ flexDirection: 'column', gap: 8 }}>
                <ThemeIcon variant="light" radius="xl" size={56}>
                  <IconPhoto size={26} />
                </ThemeIcon>
                <Text size="sm" c="dimmed" fw={600}>
                  No image generated
                </Text>
              </Center>
            )}
          </Box>

          <Group justify="space-between" align="center">
            <Text size="xs" tt="uppercase" c="dimmed" fw={600} style={{ letterSpacing: '0.06em' }}>
              Scene Image
            </Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                loading={regenerating}
                leftSection={<IconRefresh size={14} />}
                onClick={handleRegenerate}
              >
                Regenerate Image
              </Button>
            </Group>
          </Group>
          <Text c="dimmed" size="xs">
            Regenerations: {scene.regenerateCount}
          </Text>
        </Stack>
      </Card>

      {/* Visual prompt */}
      <Card withBorder radius="lg" padding="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Visual Prompt</Text>
            <Badge variant="light" size="sm">
              Image Model
            </Badge>
          </Group>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            minRows={4}
            autosize
            placeholder="Describe the image you want for this scene..."
          />
        </Stack>
      </Card>

      <Group justify="flex-end">
        {saved && (
          <Text c="teal" size="sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconCheck size={16} /> Saved
          </Text>
        )}
        <Button leftSection={<IconMovie size={16} />} loading={saving} onClick={save}>
          Save Scene
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * A compact "audio/video sync" timing helper. It plays the job's real media so
 * the user can hear exactly where a scene should start and end, then captures
 * the current playhead position into the Start/End fields with one click.
 *
 * This solves the "no idea if 9s → 4s matches my audio" problem: instead of
 * guessing seconds, you listen and lock the playhead to the exact moment.
 */
function AudioSyncTiming({
  videoUrl,
  audioUrl,
  startSeconds,
  endSeconds,
  onSetStart,
  onSetEnd,
  sceneDurationSec,
}: {
  videoUrl: string | null;
  audioUrl: string | null;
  startSeconds: number | string;
  endSeconds: number | string;
  onSetStart: (sec: number) => void;
  onSetEnd: (sec: number) => void;
  sceneDurationSec: string;
}) {
  const mediaUrl = videoUrl || audioUrl;
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [syncing, setSyncing] = useState<'start' | 'end' | null>(null);

  const start = Number(startSeconds) || 0;
  const end = Number(endSeconds) || 0;

  // Seek the strip player to the scene start whenever the component mounts or
  // the start value changes, so playback always starts at the scene's beginning.
  useEffect(() => {
    const el = mediaRef.current;
    if (el && Number.isFinite(start) && start >= 0) {
      // Only auto-seek on mount / explicit changes; avoid fighting the user
      // while they drag. Debounce via start value key.
      el.currentTime = Math.min(start, el.duration || start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) {
      // If the playhead is past the scene end, jump back to start.
      if (end > 0 && el.currentTime >= end) {
        el.currentTime = start;
      }
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const frameRef = useRef<number | null>(null);
  const tick = () => {
    const el = mediaRef.current;
    if (el) {
      setCurrent(el.currentTime);
      setDuration(el.duration || 0);
      if (!el.paused && end > 0 && el.currentTime >= end) {
        el.pause();
        setPlaying(false);
      }
    }
    frameRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mediaUrl) {
    return null;
  }

  const rangePct =
    duration > 0 ? Math.min(100, Math.max(0, (end / duration) * 100)) : 0;
  const playheadPct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <Card withBorder radius="lg" padding="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            Sync scene timing to the media
          </Text>
          <Text c="dimmed" size="xs">
            Current scene is {sceneDurationSec} long
          </Text>
        </Group>

        <Text c="dimmed" size="xs">
          Play the source, then press <b>Set start</b> or <b>Set end</b> at the exact moment.
        </Text>

        <Box
          style={{
            position: 'relative',
            height: 6,
            borderRadius: 999,
            background: 'var(--mantine-color-dark-4)',
            overflow: 'visible',
          }}
        >
          {/* Scene range highlight */}
          <Box
            style={{
              position: 'absolute',
              left: `${duration > 0 ? (start / duration) * 100 : 0}%`,
              width: `${rangePct}%`,
              height: 6,
              background: 'var(--mantine-color-violet-6)',
              borderRadius: 999,
            }}
          />
          {/* Playhead */}
          <Box
            style={{
              position: 'absolute',
              top: -4,
              left: `${playheadPct}%`,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'var(--mantine-color-white)',
              border: '2px solid var(--mantine-color-violet-6)',
              transform: 'translateX(-50%)',
            }}
          />
        </Box>

        <Group gap="sm" justify="space-between">
          <Group gap="xs">
            <ActionIcon variant="filled" onClick={togglePlay} aria-label="Play/pause">
              {playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
            </ActionIcon>
            <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatSecondsLabel(current)} / {formatSecondsLabel(duration)}
            </Text>
          </Group>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              loading={syncing === 'start'}
              leftSection={<IconMovie size={14} />}
              onClick={() => {
                setSyncing('start');
                onSetStart(Math.round(current * 100) / 100);
                window.setTimeout(() => setSyncing(null), 600);
              }}
            >
              Set start @ {formatSecondsLabel(current)}
            </Button>
            <Button
              size="xs"
              variant="light"
              color="teal"
              loading={syncing === 'end'}
              leftSection={<IconMovie size={14} />}
              onClick={() => {
                setSyncing('end');
                onSetEnd(Math.round(current * 100) / 100);
                window.setTimeout(() => setSyncing(null), 600);
              }}
            >
              Set end @ {formatSecondsLabel(current)}
            </Button>
          </Group>
        </Group>

        {/* Hidden media element used only for playback + seeking. */}
        {videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={videoUrl}
            style={{ display: 'none' }}
            preload="auto"
          />
        ) : audioUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={audioUrl}
            style={{ display: 'none' }}
            preload="auto"
          />
        ) : null}
      </Stack>
    </Card>
  );
}

/** Format seconds as m:ss (or s.s when under a minute is not desired for precision). */
function formatSecondsLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
