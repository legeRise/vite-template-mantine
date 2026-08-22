import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconEye,
  IconFileText,
  IconLock,
  IconLockOpen,
  IconPhoto,
  IconPlus,
  IconPlayerPause,
  IconPlayerPlay,
  IconSparkles,
  IconTrash,
  IconArrowBackUp,
  IconArrowForwardUp,
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
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  formatDelta,
  sceneTransitionOpacity,
  sceneTransitionTransform,
  type SceneTransition,
} from '../../lib/api';
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

/** Plain-language explanation shown under the appearance picker. */
const TRANSITION_HINTS: Record<SceneTransition, string> = {
  cut: 'Hard cut in and out — the footage snaps back the moment the scene ends.',
  fade: 'Blends in and out of the footage over 0.6s at each edge of the scene.',
  crossfade: 'Softer 1.2s blend into the footage at each edge of the scene.',
  kenburns: 'Slow push-in zoom across the whole scene — adds life to stills.',
};

export function EditorView({ scenes, onOpenPreview, onOpenExport }: EditorViewProps) {
  const {
    addScene,
    deleteScene,
    resizeScene,
    moveScene,
    undo,
    redo,
    updateScene,
    videoUrl,
    audioUrl,
  } = useVideoFlow();
  // User intent: the scene the user selected in the editor. This stays stable
  // even while playback highlight follows the playhead elsewhere.
  const [selectedSceneId, setSelectedSceneId] = useState<number>(scenes[0]?.id ?? 1);
  // Playback highlight: follows the media playhead, so the preview/timeline can
  // visually track the current scene without conflating it with user selection.
  const [playbackSceneId, setPlaybackSceneId] = useState<number | null>(null);
  const [addingScene, setAddingScene] = useState(false);
  const [deletingScene, setDeletingScene] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Increments on every manual scene selection so the inline player reliably
  // seeks + highlights the clicked scene even if it's ALREADY the active one.
  const [seekToken, setSeekToken] = useState(0);
  // Exact time (seconds) the user clicked/scrubbed on the timeline — lets the
  // playhead start from an arbitrary point (possibly mid-scene), then it's
  // reset to null so a later, identical click still re-seeks.
  const [seekTime, setSeekTime] = useState<number | null>(null);
  // Real duration (seconds) of the source media — the timeline uses it to mark
  // where the footage ends and to highlight scenes that overrun it.
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  // Live playhead time (seconds) reported by the inline player, so the timeline
  // can draw a visible scrub head at the exact position.
  const [playheadTime, setPlayheadTime] = useState(0);
  // Phones stack the layout: preview first, then a capped-height scene list.
  const isNarrow = useMediaQuery('(max-width: 62em)');
  const isPhonePortrait = useMediaQuery('(max-width: 767px) and (orientation: portrait)');
  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0];

  // Manual selection: reset the playhead to the beginning of the chosen scene,
  // but do not overwrite an in-scene scrub position that was already chosen by
  // the user while editing. The playback highlight can still follow the current
  // playhead independently of this selection.
  const selectScene = (id: number) => {
    setSelectedSceneId(id);
    setPlaybackSceneId(id);
    setSeekTime(null);
    setSeekToken((t) => t + 1);
  };
  // Playback highlight: if playback is active, it can diverge from the selection
  // without wiping the user's explicit scene choice.
  const highlightedScene = scenes.find((s) => s.id === playbackSceneId) ?? selectedScene;

  // Ctrl/Cmd + Z = undo, Ctrl/Cmd + Shift + Z = redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Called by the timeline while a scene's edge is being dragged. Neighbours
  // never move — gaps are allowed, overlaps are clamped away by the context.
  const handleResizeScene = (sceneId: number, side: 'start' | 'end', newTime: number) => {
    try {
      resizeScene(sceneId, side, newTime, videoDuration);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not update scene timing');
    }
  };

  // Called by the timeline while a whole scene is being slid to a new position
  // (duration preserved).
  const handleMoveScene = (sceneId: number, newStart: number) => {
    try {
      moveScene(sceneId, newStart, videoDuration);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not move the scene');
    }
  };

  const handleAddScene = async () => {
    setAddingScene(true);
    setAddError(null);
    try {
      const newScene = await addScene();
      setSelectedSceneId(newScene.id);
      setPlaybackSceneId(newScene.id);
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
      setSelectedSceneId(next ? next.id : 0);
      setPlaybackSceneId(next ? next.id : 0);
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
        px={{ base: 'sm', sm: 'lg' }}
        py="sm"
        wrap="wrap"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group>
          <IconVideo size={20} color="var(--ez-accent)" />
          <Text fw={700}>My Video</Text>
        </Group>
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconFileText size={16} />}
            onClick={() => downloadSceneTopics(scenes)}
          >
            Download Script
          </Button>
          <Button
            variant="subtle"
            leftSection={addingScene ? undefined : <IconPlus size={16} />}
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

      {isPhonePortrait && (
        <Alert
          color="yellow"
          icon={<IconAlertCircle size={16} />}
          m="md"
          title="Rotate to landscape for editing"
        >
          This editor is optimized for landscape mode on phone screens. Please rotate your device before trimming or moving scenes.
        </Alert>
      )}

      {/* Timeline — the primary timing surface: drag a scene's edge to resize it.
          Quiet surface around it so the timeline stays the visual anchor. */}
      <Box px="lg" py="md" bg="var(--ez-surface-2)" style={{ borderBottom: '1px solid var(--ez-line)' }}>
        <Group justify="space-between" mb="xs" align="center">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
            Timeline
          </Text>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Drag scene edges to trim · drag a scene to slide it · empty space shows raw footage ·{' '}
              {scenes.length} scenes
            </Text>
            {selectedScene && (
              <Tooltip label={selectedScene.locked ? 'Click to unlock scene' : 'Click to lock scene'} withArrow>
                <Button
                  size="compact-xs"
                  variant={selectedScene.locked ? 'filled' : 'light'}
                  color="violet"
                  leftSection={selectedScene.locked ? <IconLock size={13} /> : <IconLockOpen size={13} />}
                  onClick={() => updateScene(selectedScene.id, { locked: !selectedScene.locked })}
                  styles={{
                    root: {
                      borderColor: selectedScene.locked ? 'rgba(124,108,246,0.4)' : 'rgba(124,108,246,0.32)',
                    },
                  }}
                >
                  {selectedScene.locked ? 'Locked' : 'Lock'}
                </Button>
              </Tooltip>
            )}
          </Group>
        </Group>
        <SceneTimeline
          scenes={scenes}
          activeId={selectedSceneId}
          onSelect={selectScene}
          onResize={handleResizeScene}
          onMoveScene={handleMoveScene}
          onToggleLock={(sceneId) => {
            const scene = scenes.find((entry) => entry.id === sceneId);
            if (scene) updateScene(sceneId, { locked: !scene.locked });
          }}
          onSeek={(time) => setSeekTime(time)}
          videoDuration={videoDuration}
          playheadTime={playheadTime}
        />
      </Box>

      {/* Master–detail layout: scene sidebar on the left, detail editor on the
          right. On phones everything stacks and the preview comes first —
          users see their video before the scene list. */}
      <Grid gap={0} style={{ flex: 1, alignItems: 'stretch' }}>
        {/* Scene sidebar */}
        <Grid.Col
          span={{ base: 12, md: 3, lg: 3 }}
          order={{ base: 2, md: 1 }}
          style={{
            borderRight: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-body)',
          }}
        >
          <Box
            style={
              isNarrow
                ? { maxHeight: '40vh', overflowY: 'auto' }
                : { position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }
            }
          >
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
                  active={scene.id === selectedSceneId}
                  onClick={() => selectScene(scene.id)}
                  onToggleLock={() => updateScene(scene.id, { locked: !scene.locked })}
                />
              ))}
            </Stack>
          </Box>
        </Grid.Col>

        {/* Detail area: persistent inline viewer (left) + per-scene editor (right) */}
        <Grid.Col span={{ base: 12, md: 9, lg: 9 }} order={{ base: 1, md: 2 }}>
          <Grid gap={0}>
            {/* Persistent full-preview viewer — clicking a scene seeks it here. */}
            <Grid.Col span={{ base: 12, lg: 5 }} style={{ padding: 'var(--mantine-spacing-lg)' }}>
              <Box style={{ position: 'sticky', top: 16 }}>
                {selectedScene && (
                  <InlinePreview
                    videoUrl={videoUrl}
                    audioUrl={audioUrl}
                    scenes={scenes}
                    activeScene={selectedScene}
                    seekToken={seekToken}
                    seekTime={seekTime}
                    onSceneChange={setPlaybackSceneId}
                    onDuration={setVideoDuration}
                    onPlayhead={setPlayheadTime}
                  />
                )}
              </Box>
            </Grid.Col>
            {/* Per-scene editor */}
            <Grid.Col span={{ base: 12, lg: 7 }}>
              {selectedScene && (
                <SceneEditor
                  key={selectedScene.id}
                  scene={selectedScene}
                  onDelete={() => void handleDeleteScene(selectedScene.id)}
                  allowDelete={scenes.length > 1}
                  deleting={deletingScene}
                />
              )}
            </Grid.Col>
          </Grid>
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
  onToggleLock,
}: {
  scene: SceneModel;
  active: boolean;
  onClick: () => void;
  onToggleLock?: () => void;
}) {
  const lastTapRef = useRef<{ time: number } | null>(null);

  const handlePointerDown = () => {
    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (lastTap && now - lastTap.time < 300) {
      lastTapRef.current = null;
      onToggleLock?.();
      return;
    }
    lastTapRef.current = { time: now };
    onClick();
  };

  return (
    <Box
      onPointerDown={handlePointerDown}
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
        background: active ? 'var(--ez-accent-dim)' : 'transparent',
        border: '1px solid',
        borderColor: active ? 'var(--ez-accent)' : 'transparent',
        // Signature: selected clip keeps an accent border + soft glow ring.
        boxShadow: active ? '0 0 0 3px var(--ez-accent-dim)' : 'none',
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
            : 'var(--ez-accent-dim)',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!scene.imageUrl && <IconPhoto size={14} color="var(--ez-accent)" />}
      </Box>
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Group gap={6} align="center" wrap="nowrap">
          <Text size="sm" fw={600} lineClamp={1}>
            {String(scene.number).padStart(2, '0')} · {scene.title || `Scene ${String(scene.number).padStart(2, '0')}`}
          </Text>
          {scene.locked ? (
            <ThemeIcon size={18} radius="xl" variant="light" color="brand" title="Locked">
              <IconLock size={12} />
            </ThemeIcon>
          ) : (
            <ThemeIcon size={18} radius="xl" variant="light" color="teal" title="Unlocked">
              <IconLockOpen size={12} />
            </ThemeIcon>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {scene.start} — {scene.end}
        </Text>
      </Stack>
    </Box>
  );
}

/**
 * A time-bound horizontal timeline: the track represents the full media
 * duration (fixed), and each scene is an independent proportional block.
 *
 * Interactions (the "in control" feel):
 *  - Drag a block's LEFT/RIGHT edge to trim that scene — neighbours never move,
 *    so deliberate gaps are easy and accidental destruction is impossible.
 *  - Drag a block's BODY to slide the whole scene (duration preserved).
 *  - Edges snap to the playhead, to neighbouring edges, and to the track ends.
 *  - Click/drag empty space or the ruler to scrub the playhead.
 */
function SceneTimeline({
  scenes,
  activeId,
  onSelect,
  onResize,
  onMoveScene,
  onToggleLock,
  onSeek,
  videoDuration,
  playheadTime,
}: {
  scenes: SceneModel[];
  activeId: number;
  onSelect: (id: number) => void;
  /** Called continuously while an edge is dragged (already snapped). */
  onResize: (sceneId: number, side: 'start' | 'end', newTime: number) => void;
  /** Called continuously while a whole scene is slid (duration preserved). */
  onMoveScene?: (sceneId: number, newStart: number) => void;
  /** Toggle the lock state for a scene when the user double-taps it. */
  onToggleLock?: (sceneId: number) => void;
  /** Called with an exact time (seconds) when the user clicks/scrubs the track
   *  to seek the playhead there (may be mid-scene). */
  onSeek?: (seconds: number) => void;
  /** Real source-media duration (seconds). Defines the track length and caps
   *  the last scene's right edge. */
  videoDuration?: number | null;
  /** Live playhead time (seconds) — draws a visible scrub head on the track. */
  playheadTime?: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastTapRef = useRef<{ sceneId: number; time: number } | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // Total track length: the real media duration when known; otherwise fall
  // back to the furthest scene end so the timeline is still usable.
  const maxSceneEnd = scenes.length ? Math.max(...scenes.map((s) => s.endSeconds)) : 1;
  const total = Math.max(
    1,
    videoDuration && videoDuration > 0 ? Math.max(videoDuration, maxSceneEnd) : maxSceneEnd
  );
  const pxPerSec = trackWidth > 0 ? trackWidth / total : 800 / total;

  type Drag =
    | {
        kind: 'edge';
        sceneId: number;
        side: 'start' | 'end';
        origTime: number;
        startClientX: number;
        started: boolean;
      }
    | {
        kind: 'move';
        sceneId: number;
        origStart: number;
        startClientX: number;
        moved: boolean;
        started: boolean;
      };
  const dragRef = useRef<Drag | null>(null);
  // Floating timecode pill shown above the dragged edge/clip.
  const [dragLabel, setDragLabel] = useState<{ xPct: number; text: string } | null>(null);
  // True while the user is dragging the playhead to scrub; lets the track keep
  // seeking on pointer-move instead of only on a single click.
  const scrubbingRef = useRef(false);

  // Measure the track so snapping thresholds and ruler density are pixel-true.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setTrackWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !onSeek) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(frac * total);
  };

  /** Snap candidates: track ends, the playhead, and every OTHER scene's edges. */
  const snapTargets = (excludeSceneId: number): number[] => {
    const targets = [0, total];
    if (playheadTime != null && playheadTime > 0 && playheadTime <= total) {
      targets.push(playheadTime);
    }
    for (const s of scenes) {
      if (s.id === excludeSceneId) continue;
      targets.push(s.startSeconds, s.endSeconds);
    }
    return targets;
  };

  const applySnap = (time: number, targets: number[]): number => {
    const threshold = 8 / pxPerSec; // ~8px of magnetism
    let best = time;
    let bestDist = threshold;
    for (const t of targets) {
      const d = Math.abs(t - time);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  };

  const beginEdgeDrag = (e: React.PointerEvent, scene: SceneModel, side: 'start' | 'end') => {
    e.stopPropagation();
    if (scene.locked) {
      onSelect(scene.id);
      return;
    }
    dragRef.current = {
      kind: 'edge',
      sceneId: scene.id,
      side,
      origTime: side === 'start' ? scene.startSeconds : scene.endSeconds,
      startClientX: e.clientX,
      started: false,
    };
    const el = trackRef.current;
    if (el) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    }
  };

  const beginMoveDrag = (e: React.PointerEvent, scene: SceneModel) => {
    e.stopPropagation();
    if (scene.locked) {
      onSelect(scene.id);
      return;
    }
    dragRef.current = {
      kind: 'move',
      sceneId: scene.id,
      origStart: scene.startSeconds,
      startClientX: e.clientX,
      moved: false,
      started: false,
    };
    const el = trackRef.current;
    if (el) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (scrubbingRef.current) {
      seekFromClientX(e.clientX);
      return;
    }
    const drag = dragRef.current;
    const el = trackRef.current;
    if (!drag || !el) return;
    const dt = (e.clientX - drag.startClientX) / pxPerSec;

    if (!drag.started) {
      if (Math.abs(e.clientX - drag.startClientX) > 4) {
        drag.started = true;
      } else {
        return;
      }
    }

    if (drag.kind === 'edge') {
      const raw = drag.origTime + dt;
      const snapped = applySnap(raw, snapTargets(drag.sceneId));
      onResize(drag.sceneId, drag.side, snapped);
      setDragLabel({
        xPct: Math.min(100, Math.max(0, (snapped / total) * 100)),
        text: formatSecondsLabel(snapped),
      });
      return;
    }

    // Whole-scene slide: only commit after a small threshold so a plain click
    // stays a selection, not a jittery move.
    if (Math.abs(e.clientX - drag.startClientX) > 4) {
      drag.moved = true;
      drag.started = true;
    }
    if (!drag.started || !drag.moved || !onMoveScene) return;
    const scene = scenes.find((s) => s.id === drag.sceneId);
    if (!scene) return;
    const dur = scene.endSeconds - scene.startSeconds;
    const snapped = applySnap(drag.origStart + dt, snapTargets(drag.sceneId));
    onMoveScene(drag.sceneId, snapped);
    setDragLabel({
      xPct: Math.min(100, Math.max(0, ((snapped + dur / 2) / total) * 100)),
      text: `${formatSecondsLabel(snapped)} – ${formatSecondsLabel(snapped + dur)}`,
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag && drag.kind === 'move' && !drag.moved) {
      onSelect(drag.sceneId);
    }
    dragRef.current = null;
    setDragLabel(null);
    const el = trackRef.current;
    if (el) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    }
  };

  const activeScene = scenes.find((s) => s.id === activeId) ?? scenes[0];

  // Adaptive ruler density: pick the smallest step whose label still gets ~64px
  // of breathing room, so the ruler never turns into a crowded mess.
  const rulerStep =
    [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s * pxPerSec >= 64) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001; t += rulerStep) ticks.push(t);

  return (
    <Stack gap={8}>
      <Box
        ref={trackRef}
        onPointerDown={(e) => {
          // Empty track / ruler / gaps = scrub surface. Scene blocks and edge
          // handles stopPropagation, so this only fires on genuinely empty area.
          if (!onSeek) return;
          scrubbingRef.current = true;
          seekFromClientX(e.clientX);
          const el = trackRef.current;
          if (el) {
            try {
              el.setPointerCapture(e.pointerId);
            } catch {
              /* no-op */
            }
          }
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => {
          if (scrubbingRef.current) {
            scrubbingRef.current = false;
            const el = trackRef.current;
            if (el) {
              try {
                el.releasePointerCapture(e.pointerId);
              } catch {
                /* no-op */
              }
            }
            return;
          }
          endDrag(e);
        }}
        onPointerCancel={() => {
          scrubbingRef.current = false;
          dragRef.current = null;
          setDragLabel(null);
        }}
        style={{
          position: 'relative',
          height: 96,
          width: '100%',
          borderRadius: 'var(--mantine-radius-md)',
          background: 'var(--ez-surface-3)',
          // Deliberate "empty time" texture: wherever no scene block sits, this
          // subtle diagonal hatch shows through — gaps read as intentional.
          backgroundImage:
            'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 6px, transparent 6px 12px)',
          border: '1px solid var(--ez-line)',
          overflow: 'hidden',
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'pointer',
        }}
      >
        {/* Time ruler — real clock ticks with mono labels (a tool, not a form).
            Density adapts to zoom so labels never collide. */}
        {ticks.map((t) => (
          <Box
            key={`tick-${t}`}
            style={{
              position: 'absolute',
              left: `${Math.min(100, (t / total) * 100)}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'var(--ez-line)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        ))}
        {ticks.map((t) => (
          <Text
            key={`label-${t}`}
            size="xs"
            c="dimmed"
            className="ez-timecode"
            style={{
              position: 'absolute',
              left: `${Math.min(100, (t / total) * 100)}%`,
              top: 3,
              transform:
                t === 0
                  ? 'none'
                  : t >= total - rulerStep / 2
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
              paddingLeft: t === 0 ? 4 : 0,
              paddingRight: t >= total - rulerStep / 2 ? 4 : 0,
              pointerEvents: 'none',
              zIndex: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {formatSecondsLabel(t)}
          </Text>
        ))}

        {/* Playhead — a DRAGGABLE scrub head. Grab it and drag anywhere on the
            track to scrub playback to that exact time (works over scene blocks
            thanks to pointer capture; the wide hitbox + higher z-index win over
            the scene hitboxes underneath). */}
        {playheadTime != null && playheadTime >= 0 && (
          <Box
            onPointerDown={(e) => {
              e.stopPropagation();
              scrubbingRef.current = true;
              seekFromClientX(e.clientX);
              const el = trackRef.current;
              if (el) {
                try {
                  el.setPointerCapture(e.pointerId);
                } catch {
                  /* no-op */
                }
              }
            }}
            style={{
              position: 'absolute',
              left: `${Math.min(100, Math.max(0, (playheadTime / total) * 100))}%`,
              top: 0,
              bottom: 0,
              zIndex: 8,
              width: 22,
              transform: 'translateX(-50%)',
              cursor: 'ew-resize',
              display: 'flex',
              alignItems: 'stretch',
            }}
            role="slider"
            aria-label="Scrub playhead"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(playheadTime)}
          >
            <Box
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                top: 8,
                bottom: 0,
                width: 2.5,
                background: '#fff',
                boxShadow: '0 0 0 1px rgba(124,108,246,0.45), 0 0 8px rgba(255,255,255,0.85)',
                pointerEvents: 'none',
              }}
            />
            {/* Circular handle — always higher-contrast than anything else on screen. */}
            <Box
              style={{
                position: 'absolute',
                top: 2,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                border: '3px solid var(--ez-accent)',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            />
          </Box>
        )}

        {scenes.map((scene) => {
          const isActive = scene.id === activeId;
          const left = (scene.startSeconds / total) * 100;
          const widthPct = Math.max(((scene.endSeconds - scene.startSeconds) / total) * 100, 0.6);
          const duration = formatDelta(Math.max(0, scene.endSeconds - scene.startSeconds));

          return (
            <Box
              key={scene.id}
              onPointerDown={(e) => {
                const now = Date.now();
                const lastTap = lastTapRef.current;
                if (lastTap && lastTap.sceneId === scene.id && now - lastTap.time < 300) {
                  lastTapRef.current = null;
                  e.stopPropagation();
                  onToggleLock?.(scene.id);
                  return;
                }

                lastTapRef.current = { sceneId: scene.id, time: now };

                if (scene.locked) {
                  e.stopPropagation();
                  onSelect(scene.id);
                  return;
                }
                beginMoveDrag(e, scene);
              }}
              role="button"
              tabIndex={-1}
              aria-label={`Scene ${scene.number}: ${scene.title}`}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${widthPct}%`,
                top: 22,
                bottom: 8,
                borderRadius: 8,
                overflow: 'hidden',
                boxSizing: 'border-box',
                background: scene.imageUrl
                  ? `linear-gradient(rgba(10,10,15,0.45), rgba(10,10,15,0.55)), url(${scene.imageUrl}) center / cover`
                  : 'linear-gradient(135deg, var(--ez-surface-2), var(--ez-surface-1))',
                cursor: 'grab',
                border: isActive ? '2px solid var(--ez-accent)' : '1px solid var(--ez-line-strong)',
                // Signature: selected clip keeps an accent border + soft glow ring.
                boxShadow: isActive
                  ? '0 0 0 3px var(--ez-accent-dim), 0 2px 8px rgba(0,0,0,0.35)'
                  : '0 1px 4px rgba(0,0,0,0.25)',
                minWidth: 18,
                transition: 'border-color 120ms ease, box-shadow 120ms ease',
                zIndex: 1,
              }}
            >
              {/* Label plate — number + duration in the mono face */}
              <Stack
                gap={0}
                align="flex-start"
                style={{
                  pointerEvents: 'none',
                  minWidth: 0,
                  position: 'absolute',
                  left: 6,
                  bottom: 4,
                  right: 6,
                }}
              >
                <Text size="xs" fw={700} c="white" lh={1.2} lineClamp={1} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                  {String(scene.number).padStart(2, '0')}
                </Text>
                {widthPct > 7 && (
                  <Text size="xs" c="white" opacity={0.85} lh={1.2} className="ez-timecode" style={{ whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                    {duration}
                  </Text>
                )}
              </Stack>

              {scene.locked && (
                <ThemeIcon
                  size={18}
                  radius="xl"
                  variant="light"
                  color="brand"
                  title="Locked"
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    zIndex: 4,
                    border: '1px solid rgba(0,0,0,0.15)',
                  }}
                >
                  <IconLock size={12} />
                </ThemeIcon>
              )}

              {/* LEFT edge handle — trim this scene's start. Wide hitbox so it
                  is easy to grab (and touch-friendly); brightens on hover via
                  the active state. */}
              <Box
                onPointerDown={(e) => beginEdgeDrag(e, scene, 'start')}
                style={{
                  position: 'absolute',
                  left: -6,
                  top: 0,
                  bottom: 0,
                  width: 24,
                  cursor: scene.locked ? 'default' : 'ew-resize',
                  zIndex: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: scene.locked ? 0.6 : 1,
                }}
              >
                <Box
                  style={{
                    width: isActive ? 4 : 3,
                    height: '46%',
                    borderRadius: 2,
                    background: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                    transition: 'background 120ms ease',
                  }}
                />
              </Box>

              {/* RIGHT edge handle — trim this scene's end. */}
              <Box
                onPointerDown={(e) => beginEdgeDrag(e, scene, 'end')}
                style={{
                  position: 'absolute',
                  right: -6,
                  top: 0,
                  bottom: 0,
                  width: 24,
                  cursor: scene.locked ? 'default' : 'ew-resize',
                  zIndex: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: scene.locked ? 0.6 : 1,
                }}
              >
                <Box
                  style={{
                    width: isActive ? 4 : 3,
                    height: '46%',
                    borderRadius: 2,
                    background: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                    transition: 'background 120ms ease',
                  }}
                />
              </Box>
            </Box>
          );
        })}

        {/* Floating timecode pill while dragging an edge or sliding a clip */}
        {dragLabel && (
          <Box
            className="ez-timecode"
            style={{
              position: 'absolute',
              left: `${dragLabel.xPct}%`,
              top: 0,
              transform: 'translateX(-50%)',
              background: '#fff',
              color: 'var(--ez-accent)',
              borderRadius: 999,
              padding: '2px 10px',
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: 'var(--mantine-shadow-md)',
              pointerEvents: 'none',
              zIndex: 9,
            }}
          >
            {dragLabel.text}
          </Box>
        )}
      </Box>

      {/* Active scene readout — clear, non-technical pacing info */}
      <Group justify="space-between" px={2}>
        <Text size="sm" fw={600} lineClamp={1}>
          Scene {String(activeScene.number).padStart(2, '0')}
        </Text>
        <Group gap="md">
          <Text size="sm" c="dimmed" className="ez-timecode">
            {formatSecondsLabel(activeScene.startSeconds)} – {formatSecondsLabel(activeScene.endSeconds)}
          </Text>
          <Badge variant="light" color="brand" size="sm" className="ez-timecode">
            {formatDelta(activeScene.endSeconds - activeScene.startSeconds)}
          </Badge>
        </Group>
      </Group>
    </Stack>
  );
}

/**
 * A persistent inline viewer (full-preview style) that always plays the whole
 * source video with scene images overlaid as the playhead moves. It does NOT
 * reset when you select a scene — clicking a scene seeks the playhead to that
 * scene's start (and playback continues past scene boundaries).
 */
function InlinePreview({
  videoUrl,
  audioUrl,
  scenes,
  activeScene,
  seekToken,
  seekTime,
  onSceneChange,
  onDuration,
  onPlayhead,
}: {
  videoUrl: string | null;
  audioUrl: string | null;
  scenes: SceneModel[];
  activeScene: SceneModel;
  /** Increments on every manual scene click so the player re-seeks even if the
   *  clicked scene == the currently active scene. */
  seekToken: number;
  /** When non-null and changes, the playhead jumps to this EXACT time (may be
   *  mid-scene — e.g. the user clicked/scrubbed the timeline at an arbitrary
   *  point). Playback starts there if it was already playing, else it stays
   *  paused at that spot. */
  seekTime: number | null;
  /** Called when the playhead enters a new scene (so the sidebar can follow). */
  onSceneChange?: (sceneId: number) => void;
  /** Called with the real media duration (seconds) once known. */
  onDuration?: (seconds: number) => void;
  /** Called with the current playhead time (seconds) when it changes, so the
   *  timeline can draw a live scrub head. */
  onPlayhead?: (seconds: number) => void;
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(false);
  const hasMedia = !!videoUrl || !!audioUrl;

  // Report the real media duration (seconds) up once it's known, so the
  // timeline can show where the footage ends and highlight any overflow.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !onDuration) return;
    const report = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) onDuration(el.duration);
    };
    el.addEventListener('loadedmetadata', report);
    el.addEventListener('durationchange', report);
    return () => {
      el.removeEventListener('loadedmetadata', report);
      el.removeEventListener('durationchange', report);
    };
  }, [onDuration]);

  // An explicit scene selection should jump to that scene's start. A scrubbed
  // mid-scene playhead should be preserved until the user explicitly chooses a
  // different scene or timeline point. This avoids the snap-back bug where the
  // player keeps resetting to a scene origin after the user has already scrubbed
  // inside the scene.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const target = Math.max(0, activeScene.startSeconds);
    const shouldJumpToSceneStart = seekToken > 0 && Math.abs(el.currentTime - target) > 0.05;

    if (!shouldJumpToSceneStart) return;

    el.pause();
    setPlaying(false);
    el.currentTime = target;
    setPlayTime(target);
  }, [activeScene.id, activeScene.startSeconds, seekToken]);

  // Exact-point seeking: when the parent asks to jump to an arbitrary time
  // (mid-scene timeline click/scrub), seek there. If already playing, continue
  // from that precise point; otherwise land paused there.
  useEffect(() => {
    if (seekTime == null) return;
    const el = mediaRef.current;
    if (!el) return;
    const t = Math.max(0, Math.min(seekTime, isFinite(el.duration) ? el.duration : seekTime));
    el.currentTime = t;
    setPlayTime(t);
  }, [seekTime]);

  const startPlayback = () => {
    const el = mediaRef.current;
    if (!el) return;
    const nextTime = playTime > 0 ? playTime : Math.max(0, activeScene.startSeconds);
    el.currentTime = nextTime;
    setPlaying(true);
    setPlayTime(nextTime);
    void el.play().catch(() => undefined);
  };

  const stopPlayback = () => {
    mediaRef.current?.pause();
    setPlaying(false);
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    setPlayTime(e.currentTarget.currentTime);
  };

  // Display the generated scene image only when the playhead is actually in a
  // scene window. Empty gaps must show the raw video instead of the last scene
  // image being stretched over the whole remaining timeline.
  const overlayScene = scenes.find((s) => playTime >= s.startSeconds && playTime < s.endSeconds) ?? null;
  const overlaySceneElapsed = overlayScene
    ? playTime - overlayScene.startSeconds
    : 0;
  const overlaySceneDuration = overlayScene
    ? overlayScene.endSeconds - overlayScene.startSeconds
    : 8;
  const overlayAlpha = overlayScene?.imageUrl
    ? sceneTransitionOpacity(
        overlayScene.transition,
        overlaySceneElapsed,
        overlaySceneDuration
      )
    : 0;
  const overlayTransform =
    overlayScene?.transition === 'kenburns'
      ? sceneTransitionTransform(overlaySceneElapsed, overlaySceneDuration)
      : undefined;

  // Notify the parent whenever the playhead moves into a different scene so the
  // sidebar/timeline highlight can follow along.
  useEffect(() => {
    if (overlayScene && onSceneChange) {
      onSceneChange(overlayScene.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayScene?.id]);

  // Report the raw playhead time up so the timeline can draw a live scrub head.
  useEffect(() => {
    if (onPlayhead) onPlayhead(playTime);
  }, [playTime, onPlayhead]);

  return (
    <Card withBorder radius="xl" padding={0} style={{ overflow: 'hidden' }}>
      <Card.Section
        style={{ position: 'relative' }}
        onMouseEnter={() => setControlsVisible(true)}
        onMouseLeave={() => setControlsVisible(false)}
      >
        <Box
          style={{
            width: '100%',
            aspectRatio: '16 / 9',
            background: activeScene.imageUrl
              ? `url(${activeScene.imageUrl}) center / cover`
              : 'var(--ez-accent-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Media element is ALWAYS mounted so the ref is ready before play. */}
          {videoUrl ? (
            <video
              ref={mediaRef as React.Ref<HTMLVideoElement>}
              src={videoUrl}
              preload="metadata"
              playsInline
              onTimeUpdate={onTimeUpdate}
              onEnded={() => setPlaying(false)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                position: 'absolute',
                inset: 0,
                display: playing ? 'block' : 'none',
              }}
            />
          ) : audioUrl ? (
            <audio
              ref={mediaRef as React.Ref<HTMLAudioElement>}
              src={audioUrl}
              preload="metadata"
              onTimeUpdate={onTimeUpdate}
              onEnded={() => setPlaying(false)}
            />
          ) : null}

          {/* Scene image overlay on the playing video (same as full preview). */}
          {playing && videoUrl && overlayScene?.imageUrl && (
            <img
              src={overlayScene.imageUrl}
              alt={overlayScene.title}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: overlayAlpha,
                // Ken Burns: apply a slow zoom to the image.
                transform: overlayTransform,
                willChange: overlayTransform ? 'transform' : undefined,
                pointerEvents: 'none',
              }}
            />
          )}

          {!playing && (
            <>
              {!hasMedia && !activeScene.imageUrl && (
                <Center style={{ flexDirection: 'column', gap: 8 }}>
                  <ThemeIcon variant="light" radius="xl" size={56}>
                    <IconPhoto size={26} />
                  </ThemeIcon>
                  <Text size="sm" c="dimmed" fw={600}>
                    No media
                  </Text>
                </Center>
              )}
              {hasMedia && (
                <Center
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.25)',
                  }}
                >
                  <ActionIcon
                    variant="filled"
                    radius="xl"
                    size={60}
                    aria-label="Play"
                    onClick={startPlayback}
                    style={{ boxShadow: 'var(--mantine-shadow-brand)', opacity: 0.95 }}
                  >
                    <IconPlayerPlay size={28} fill="currentColor" />
                  </ActionIcon>
                </Center>
              )}
            </>
          )}
        </Box>

        {/* Big central pause control while playing — mirrors the play button so
            pausing feels the same as starting. It stays out of the way: only
            visible while hovering the video, so it doesn't permanently cover it. */}
        {playing && controlsVisible && (
          <>
            <Center style={{ position: 'absolute', inset: 0 }}>
              <ActionIcon
                variant="filled"
                radius="xl"
                size={60}
                aria-label="Pause"
                onClick={stopPlayback}
                style={{ boxShadow: 'var(--mantine-shadow-brand)', opacity: 0.95 }}
              >
                <IconPlayerPause size={28} fill="currentColor" />
              </ActionIcon>
            </Center>
            <Group
              gap={6}
              pos="absolute"
              bottom={8}
              left={8}
              px={8}
              py={4}
              style={{
                background: 'rgba(0,0,0,0.55)',
                borderRadius: 999,
                backdropFilter: 'blur(4px)',
                pointerEvents: 'none',
              }}
            >
              <Text size="xs" c="white" className="ez-timecode">
                {formatSecondsLabel(playTime)}
              </Text>
            </Group>
          </>
        )}
      </Card.Section>
      <Group justify="space-between" align="center" px="md" py="xs">
        <Text size="xs" tt="uppercase" c="dimmed" fw={600} style={{ letterSpacing: '0.08em' }}>
          Scene image · tap ▶ to play in place
        </Text>
        <Group gap="xs">
          <Text size="xs" c="dimmed" className="ez-timecode">
            {formatSecondsLabel(activeScene.startSeconds)} – {formatSecondsLabel(activeScene.endSeconds)}
          </Text>
          <Badge variant="light" color="brand" size="xs" className="ez-timecode">
            {formatDelta(activeScene.endSeconds - activeScene.startSeconds)}
          </Badge>
        </Group>
      </Group>
    </Card>
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
  const { updateScene, regenerateImage, undo, redo, canUndo, canRedo, historyToken, changeWithAI } =
    useVideoFlow();
  const [title, setTitle] = useState(scene.title);
  const [regenerating, setRegenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Change with AI" — inline instruction input.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastHistoryTokenRef = useRef(historyToken);

  // Sync title edits into the shared scene state. This updates the local draft
  // (written to localStorage instantly) — the backend is ONLY hit on page leave
  // / hide / pause, so no per-change network calls.
  //
  // When historyToken changes (an undo/redo just restored a snapshot), we DON'T
  // autosave — instead we sync the field back to the restored scene so the stale
  // keystroke we were about to re-apply doesn't wipe the undo (the root cause of
  // "undo works then loses control").
  useEffect(() => {
    if (lastHistoryTokenRef.current !== historyToken) {
      lastHistoryTokenRef.current = historyToken;
      setTitle(scene.title);
      return;
    }
    if (title === scene.title) return;
    const t = window.setTimeout(() => {
      updateScene(scene.id, { scene_title: title });
      setSaved(true);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => setSaved(false), 2000);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, scene.id, scene.title, historyToken]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      await regenerateImage(scene.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate image');
    } finally {
      setRegenerating(false);
    }
  };

  // "Change with AI": the user describes the change in plain language; the
  // backend revises its internal prompt and regenerates. The prompt itself is
  // never shown — the UI just confirms the update.
  const handleChangeWithAI = async () => {
    const instruction = aiInstruction.trim();
    if (!instruction) {
      setError('Tell us what you would like to change first.');
      return;
    }
    setAiBusy(true);
    setError(null);
    try {
      await changeWithAI(scene.id, instruction);
      setAiDone(true);
      setAiOpen(false);
      setAiInstruction('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change with AI');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Box py="lg" px="xl">
      {/* Header: scene number + title + status (wraps on narrow screens) */}
      <Group justify="space-between" align="center" mb="lg">
        <Group gap="md" align="center" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ThemeIcon variant="light" radius="lg" size={46} color="brand" style={{ flexShrink: 0 }}>
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

      <Stack gap="md">
        {/* Scene image — regenerate / change with AI. The internal prompt is
            never shown: it's a business secret. Users shape the image through
            the plain-language "Change with AI" instruction instead. */}
        <Card withBorder radius="xl" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <Text fw={600} size="sm">
                  Scene image
                </Text>
                <Badge variant="light" size="sm">
                  Image model
                </Badge>
              </Group>
            </Group>

            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>
                {scene.regenerateCount > 0
                  ? `Regenerated ${scene.regenerateCount} time${scene.regenerateCount === 1 ? '' : 's'} · uses a credit`
                  : 'Recreate this frame, or tell the AI what to change.'}
              </Text>
              <Group gap="xs" wrap="wrap" style={{ flexShrink: 0 }}>
                <Button
                  size="xs"
                  variant="light"
                  color="brand"
                  loading={regenerating}
                  loaderProps={{ size: 14 }}
                  onClick={handleRegenerate}
                >
                  Regenerate
                </Button>
                <Tooltip
                  label="Describe the change in plain words — the AI recreates the frame."
                  withArrow
                >
                  <Button
                    size="xs"
                    variant="light"
                    color="brand"
                    leftSection={<IconSparkles size={14} />}
                    onClick={() => {
                      setAiOpen((v) => !v);
                      setAiDone(false);
                    }}
                  >
                    Change with AI
                  </Button>
                </Tooltip>
              </Group>
            </Group>

            {aiOpen && (
              <Group gap="xs" align="flex-end" wrap="wrap">
                <TextInput
                  flex={1}
                  size="sm"
                  placeholder="e.g. make it brighter, add mountains in the background"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleChangeWithAI();
                  }}
                  disabled={aiBusy}
                  autoFocus
                />
                <Button
                  size="sm"
                  color="brand"
                  loading={aiBusy}
                  loaderProps={{ size: 16 }}
                  disabled={!aiInstruction.trim()}
                  onClick={() => void handleChangeWithAI()}
                >
                  Generate
                </Button>
              </Group>
            )}

            {(regenerating || aiBusy) && (
              <Text size="xs" c="dimmed" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconSparkles size={14} color="var(--ez-accent-b)" />
                Recreating your frame — this can take up to a minute…
              </Text>
            )}

            {aiDone && (
              <Text size="xs" c="dimmed" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconSparkles size={14} color="var(--ez-accent-b)" />
                Scene updated.
              </Text>
            )}
          </Stack>
        </Card>

        {/* Appearance — how this scene's generated frame covers the footage.
            The frame displays for EXACTLY the scene's time window (shown in
            the badge); before and after it, the raw video plays untouched. */}
        <Card withBorder radius="xl" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="wrap">
              <Text fw={600} size="sm">
                How this scene appears
              </Text>
              <Badge variant="light" size="sm" className="ez-timecode">
                frame on screen {scene.start} – {scene.end}
              </Badge>
            </Group>
            <SegmentedControl
              fullWidth
              size="xs"
              value={scene.transition}
              onChange={(value) => {
                updateScene(scene.id, { transition: value as SceneTransition });
                setSaved(true);
                if (saveTimer.current) window.clearTimeout(saveTimer.current);
                saveTimer.current = window.setTimeout(() => setSaved(false), 2000);
              }}
              data={[
                { label: 'Cut', value: 'cut' },
                { label: 'Fade', value: 'fade' },
                { label: 'Crossfade', value: 'crossfade' },
                { label: 'Ken Burns', value: 'kenburns' },
              ]}
            />
            <Text size="xs" c="dimmed">
              {TRANSITION_HINTS[scene.transition]}
            </Text>
          </Stack>
        </Card>

      </Stack>

      {/* Footer — undo/redo + destructive delete (everything autosaves, so no Save button) */}
      <Divider my="lg" />
      <Group
        justify="space-between"
        align="center"
        wrap="wrap"
        gap="sm"
        style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--mantine-color-body)',
          padding: '10px 4px',
          zIndex: 5,
        }}
      >
        <Tooltip label="Remove this scene (use Undo to bring it back)" withArrow>
          <span>
            <Button
              variant="subtle"
              color="red"
              leftSection={deleting ? undefined : <IconTrash size={16} />}
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
          <Button
            variant="subtle"
            leftSection={<IconArrowBackUp size={16} />}
            disabled={!canUndo}
            onClick={undo}
          >
            Undo
          </Button>
          <Button
            variant="subtle"
            leftSection={<IconArrowForwardUp size={16} />}
            disabled={!canRedo}
            onClick={redo}
          >
            Redo
          </Button>
        </Group>
      </Group>
    </Box>
  );
}

/** Format seconds as m:ss (or s.s when under a minute is not desired for precision). */
function formatSecondsLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
