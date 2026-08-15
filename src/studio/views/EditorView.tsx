import { useEffect, useRef, useState } from 'react';
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconEye,
  IconFileText,
  IconLock,
  IconLockOpen,
  IconMaximize,
  IconMinimize,
  IconPhoto,
  IconPlus,
  IconPlayerPause,
  IconPlayerPlay,
  IconSparkles,
  IconTrash,
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
  Divider,
  Grid,
  Group,
  RangeSlider,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Tooltip,
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
  onOpenPreview: () => void;
  onOpenExport: () => void;
}

export function EditorView({ scenes, onOpenPreview, onOpenExport }: EditorViewProps) {
  const { addScene, deleteScene } = useVideoFlow();
  const [activeId, setActiveId] = useState<number>(scenes[0]?.id ?? 1);
  const [addingScene, setAddingScene] = useState(false);
  const [deletingScene, setDeletingScene] = useState(false);
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

  // Delete a scene, then keep the editor on a sensible remaining scene.
  const handleDeleteScene = async (sceneId: number) => {
    setDeletingScene(true);
    setAddError(null);
    try {
      const remaining = await deleteScene(sceneId);
      // Select the same position in the new list, or the first remaining one.
      const idx = scenes.findIndex((s) => s.id === sceneId);
      const next = remaining[Math.min(Math.max(idx, 0), remaining.length - 1)];
      setActiveId(next ? next.id : 0);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to delete scene');
    } finally {
      setDeletingScene(false);
    }
  };

  return (
    <Stack gap={0} style={{ minHeight: '100vh' }} bg="var(--app-bg)">
      {/* Toolbar */}
      <Group
        justify="space-between"
        px="lg"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group>
          <IconVideo size={20} color="var(--mantine-color-violet-6)" />
          <Text fw={700}>My Video</Text>
        </Group>
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconFileText size={16} />}
            onClick={() => downloadSceneTopics(scenes)}
          >
            Download Topics
          </Button>
          <Button
            variant="subtle"
            leftSection={<IconPlus size={16} />}
            onClick={() => void handleAddScene()}
            loading={addingScene}
          >
            Add Scene
          </Button>
          <Button variant="subtle" leftSection={<IconEye size={16} />} onClick={onOpenPreview}>
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

      {/* Master–detail layout: scene sidebar on the left, detail editor on the right. */}
      <Grid gap={0} style={{ flex: 1, alignItems: 'stretch' }}>
        {/* Scene sidebar */}
        <Grid.Col
          span={{ base: 12, md: 3, lg: 3 }}
          style={{
            borderRight: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-body)',
          }}
        >
          <Box style={{ position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }}>
            <Group justify="space-between" px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
              <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                Scenes
              </Text>
              <Badge variant="light" size="sm">
                {scenes.length}
              </Badge>
            </Group>
            <Stack gap={6} p="sm">
              {scenes.map((scene) => (
                <SceneRowItem
                  key={scene.id}
                  scene={scene}
                  active={scene.id === active.id}
                  onClick={() => setActiveId(scene.id)}
                />
              ))}
            </Stack>
          </Box>
        </Grid.Col>

        {/* Detail editor */}
        <Grid.Col span={{ base: 12, md: 9, lg: 9 }}>
          {active && (
            <SceneEditor
              key={active.id}
              scene={active}
              onDelete={() => void handleDeleteScene(active.id)}
              allowDelete={scenes.length > 1}
              deleting={deletingScene}
            />
          )}
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

/** A single row in the left scene sidebar. */
function SceneRowItem({
  scene,
  active,
  onClick,
}: {
  scene: SceneModel;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 8,
        borderRadius: 'var(--mantine-radius-md)',
        cursor: 'pointer',
        background: active ? 'var(--mantine-color-violet-0)' : 'transparent',
        border: '1px solid',
        borderColor: active ? 'var(--mantine-color-violet-4)' : 'transparent',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      <Box
        style={{
          width: 48,
          height: 32,
          borderRadius: 'var(--mantine-radius-sm)',
          background: scene.imageUrl
            ? `url(${scene.imageUrl}) center / cover`
            : 'var(--mantine-color-violet-1)',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!scene.imageUrl && <IconPhoto size={14} color="var(--mantine-color-violet-6)" />}
      </Box>
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} lineClamp={1}>
          {String(scene.number).padStart(2, '0')} · {scene.title || `Scene ${String(scene.number).padStart(2, '0')}`}
        </Text>
        <Text size="xs" c="dimmed">
          {scene.start} — {scene.end}
        </Text>
      </Stack>
    </Box>
  );
}

function SceneEditor({
  scene,
  onDelete,
  allowDelete,
  deleting,
}: {
  scene: SceneModel;
  onDelete: () => void;
  allowDelete: boolean;
  deleting: boolean;
}) {
  const { updateScene, regenerateImage, videoUrl, audioUrl } = useVideoFlow();
  const [title, setTitle] = useState(scene.title);
  const [prompt, setPrompt] = useState(scene.prompt);
  const [startSeconds, setStartSeconds] = useState<number | string>(scene.startSeconds);
  const [endSeconds, setEndSeconds] = useState<number | string>(scene.endSeconds);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The prompt is locked (read-only) by default to prevent accidental AI
  // regenerations that spend credits. Unlock before editing.
  const [promptLocked, setPromptLocked] = useState(true);
  const [promptExpanded, setPromptExpanded] = useState(false);
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

  const start = typeof startSeconds === 'number' ? startSeconds : Number(startSeconds) || 0;
  const end = typeof endSeconds === 'number' ? endSeconds : Number(endSeconds) || 0;
  // Media duration (seconds) surfaces from the sync player so the timing slider
  // can span the whole clip — letting users trim OR extend the scene duration.
  const [mediaDuration, setMediaDuration] = useState(0);
  const sliderMax = Math.max(mediaDuration || 0, end) || 1;

  const PROMPT_MAX = 1000;
  const PREVIEW_CHARS = 220;

  return (
    <Box py="lg" px="xl">
      {/* Header: scene number + title + status */}
      <Group justify="space-between" align="center" wrap="nowrap" mb="lg">
        <Group gap="md" align="center" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ThemeIcon variant="light" radius="lg" size={46} color="violet" style={{ flexShrink: 0 }}>
            <Text fw={700} size="md">
              {String(scene.number).padStart(2, '0')}
            </Text>
          </ThemeIcon>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="Scene title"
            size="md"
            style={{ flex: 1, minWidth: 0, maxWidth: 520 }}
          />
        </Group>
        <Badge
          variant={scene.edited ? 'light' : 'default'}
          color={scene.edited ? 'teal' : 'gray'}
          size="sm"
        >
          {scene.edited ? 'Edited' : 'Generated'}
        </Badge>
      </Group>

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} mb="lg">
          {error}
        </Alert>
      )}

      <Grid gap="xl">
        {/* Left column — the generated frame */}
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder radius="xl" padding={0} style={{ overflow: 'hidden' }}>
            <Card.Section>
              <Box
                style={{
                  width: '100%',
                  aspectRatio: '16 / 9',
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
            </Card.Section>
            <Group justify="space-between" align="center" px="md" py="xs">
              <Text size="xs" tt="uppercase" c="dimmed" fw={600} style={{ letterSpacing: '0.08em' }}>
                Scene image
              </Text>
            </Group>
          </Card>
        </Grid.Col>

        {/* Right column — prompt + timing */}
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Stack gap="md" style={{ position: 'sticky', top: 16 }}>
            {/* Visual prompt */}
            <Card withBorder radius="xl" padding="lg">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <Text fw={600} size="sm">
                      Visual prompt
                    </Text>
                    <Badge variant="light" size="sm">
                      Image model
                    </Badge>
                  </Group>
                  <Tooltip
                    label={promptLocked ? 'Unlock to edit the prompt' : 'Lock the prompt'}
                    withArrow
                  >
                    <ActionIcon
                      variant={promptLocked ? 'light' : 'filled'}
                      color={promptLocked ? 'gray' : 'violet'}
                      radius="xl"
                      onClick={() => setPromptLocked((v) => !v)}
                      aria-label={promptLocked ? 'Unlock prompt' : 'Lock prompt'}
                    >
                      {promptLocked ? <IconLock size={16} /> : <IconLockOpen size={16} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>

                {promptLocked ? (
                  /* Locked — read-only preview with a collapse/expand toggle for long prompts. */
                  <Box>
                    <Text size="sm" lh={1.6} lineClamp={promptExpanded ? undefined : 3}>
                      {prompt || 'No prompt yet — unlock to write a description.'}
                    </Text>
                    {prompt.length > PREVIEW_CHARS && (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        rightSection={
                          promptExpanded ? <IconMinimize size={14} /> : <IconMaximize size={14} />
                        }
                        mt="xs"
                        onClick={() => setPromptExpanded((v) => !v)}
                      >
                        {promptExpanded ? 'Show less' : 'Show more'}
                      </Button>
                    )}
                  </Box>
                ) : (
                  /* Unlocked — editable textarea with a character limit. */
                  <>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.currentTarget.value.slice(0, PROMPT_MAX))}
                      minRows={4}
                      maxRows={12}
                      autosize
                      maxLength={PROMPT_MAX}
                      placeholder="Describe the image you want for this scene..."
                    />
                    <Text size="xs" c="dimmed" ta="right">
                      {prompt.length}/{PROMPT_MAX}
                    </Text>
                  </>
                )}

                <Divider />
                <Group justify="space-between" align="center">
                  <Text size="xs" c="dimmed">
                    {scene.regenerateCount > 0
                      ? `Regenerated ${scene.regenerateCount} time${scene.regenerateCount === 1 ? '' : 's'} · uses a credit`
                      : 'Recreate this frame from the prompt.'}
                  </Text>
                  <Tooltip
                    label={
                      promptLocked
                        ? 'Unlock the prompt to change the image with AI'
                        : 'Recreates the image from this prompt. Uses one AI generation credit.'
                    }
                    withArrow
                  >
                    <span>
                      <Button
                        size="xs"
                        variant="outline"
                        color="violet"
                        disabled={promptLocked}
                        loading={regenerating}
                        leftSection={<IconSparkles size={14} />}
                        onClick={handleRegenerate}
                      >
                        Change with AI
                      </Button>
                    </span>
                  </Tooltip>
                </Group>
              </Stack>
            </Card>

            {/* Timing */}
            <Card withBorder radius="xl" padding="lg">
              <Stack gap="md">
                <Group justify="space-between" align="baseline">
                  <Text fw={600} size="sm">
                    Timing
                  </Text>
                  <Text size="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatSecondsLabel(start)} — {formatSecondsLabel(end)}
                  </Text>
                </Group>

                <Text c="dimmed" size="xs">
                  Drag the handles to trim or extend how long this scene plays.
                </Text>

                <RangeSlider
                  value={[start, end]}
                  min={0}
                  max={sliderMax}
                  step={0.1}
                  minRange={0.2}
                  color="violet"
                  size="sm"
                  label={formatSecondsLabel}
                  labelAlwaysOn
                  onChange={([s, e]) => {
                    setStartSeconds(Math.round(s * 100) / 100);
                    setEndSeconds(Math.round(e * 100) / 100);
                  }}
                />

                <Divider />

                <AudioSyncTiming
                  videoUrl={videoUrl}
                  audioUrl={audioUrl}
                  startSeconds={startSeconds}
                  endSeconds={endSeconds}
                  onSetStart={(sec) => setStartSeconds(sec)}
                  onSetEnd={(sec) => setEndSeconds(sec)}
                  sceneDurationSec={formatDelta(scene.endSeconds - scene.startSeconds)}
                  onDurationChange={setMediaDuration}
                />
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Footer — the flow's primary action + destructive delete */}
      <Divider my="lg" />
      <Group justify="space-between" align="center" style={{ position: 'sticky', bottom: 0, background: 'var(--mantine-color-body)', padding: '10px 4px', zIndex: 5 }}>
        <Tooltip
          label={allowDelete ? 'Remove this scene' : 'Keep at least one scene'}
          withArrow
        >
          <span>
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              disabled={!allowDelete || deleting}
              loading={deleting}
              onClick={onDelete}
            >
              Delete Scene
            </Button>
          </span>
        </Tooltip>
        <Group gap="sm">
          {saved && (
            <Text c="teal" size="sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconCheck size={16} /> Saved
            </Text>
          )}
          <Button leftSection={<IconCheck size={16} />} loading={saving} onClick={save}>
            Save Scene
          </Button>
        </Group>
      </Group>
    </Box>
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
  onDurationChange,
}: {
  videoUrl: string | null;
  audioUrl: string | null;
  startSeconds: number | string;
  endSeconds: number | string;
  onSetStart: (sec: number) => void;
  onSetEnd: (sec: number) => void;
  sceneDurationSec: string;
  onDurationChange?: (duration: number) => void;
}) {
  const mediaUrl = videoUrl || audioUrl;
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [syncing, setSyncing] = useState<'start' | 'end' | null>(null);

  const start = Number(startSeconds) || 0;
  const end = Number(endSeconds) || 0;

  // Surface the media duration to the parent so the timing slider can span the
  // whole clip (letting users trim OR extend the scene duration).
  useEffect(() => {
    if (onDurationChange && duration > 0) {
      onDurationChange(duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

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
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        Play the media — at the exact moment the scene should start, tap{' '}
        <b>Set start</b>; at the moment it should end, tap <b>Set end</b>.
      </Text>

      {/* Progress bar with the scene's range and the playhead */}
      <Box
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 999,
          background: 'var(--mantine-color-dark-3)',
          overflow: 'visible',
        }}
      >
        {/* Scene range highlight */}
        <Box
          style={{
            position: 'absolute',
            left: `${duration > 0 ? (start / duration) * 100 : 0}%`,
            width: `${rangePct}%`,
            height: 8,
            background: 'var(--mantine-color-violet-5)',
            borderRadius: 999,
          }}
        />
        {/* Playhead */}
        <Box
          style={{
            position: 'absolute',
            top: -4,
            left: `${playheadPct}%`,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'var(--mantine-color-white)',
            border: '3px solid var(--mantine-color-violet-6)',
            transform: 'translateX(-50%)',
          }}
        />
      </Box>

      <Group gap="sm" justify="space-between" align="center">
        <Group gap="xs">
          <ActionIcon variant="filled" radius="xl" onClick={togglePlay} aria-label="Play/pause">
            {playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
          </ActionIcon>
          <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatSecondsLabel(current)} / {formatSecondsLabel(duration)}
          </Text>
        </Group>

        <Group gap="xs">
          <Button
            size="xs"
            variant="outline"
            color="violet"
            loading={syncing === 'start'}
            onClick={() => {
              setSyncing('start');
              onSetStart(Math.round(current * 100) / 100);
              window.setTimeout(() => setSyncing(null), 500);
            }}
          >
            Set start
          </Button>
          <Button
            size="xs"
            variant="outline"
            color="teal"
            loading={syncing === 'end'}
            onClick={() => {
              setSyncing('end');
              onSetEnd(Math.round(current * 100) / 100);
              window.setTimeout(() => setSyncing(null), 500);
            }}
          >
            Set end
          </Button>
        </Group>
      </Group>

      {/* Current locked-in values */}
      <Group gap="xl">
        <Text size="xs" c="dimmed">
          Start: <b>{formatSecondsLabel(start)}</b>
        </Text>
        <Text size="xs" c="dimmed">
          End: <b>{formatSecondsLabel(end)}</b>
        </Text>
        <Text size="xs" c="dimmed">
          Length: <b>{sceneDurationSec}</b>
        </Text>
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
  );
}

/** Format seconds as m:ss (or s.s when under a minute is not desired for precision). */
function formatSecondsLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
