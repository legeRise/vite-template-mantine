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
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  formatDelta,
  sceneOverlayAlpha,
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
  const {
    addScene,
    deleteScene,
    moveSceneBoundary,
    moveSceneStart,
    resizeSceneEnd,
    undo,
    redo,
    videoUrl,
    audioUrl,
  } = useVideoFlow();
  const [activeId, setActiveId] = useState<number>(scenes[0]?.id ?? 1);
  // Follows the playhead during playback (drives the sidebar/timeline highlight)
  // so the scene list visually progresses as the video moves from scene to scene.
  const [highlightId, setHighlightId] = useState<number | null>(null);
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
  const active = scenes.find((s) => s.id === activeId) ?? scenes[0];

  // Manual selection: make it authoritative for highlight AND force a seek.
  const selectScene = (id: number) => {
    setActiveId(id);
    setHighlightId(id);
    setSeekToken((t) => t + 1);
  };
  // The highlighted scene: follows playback if playing, otherwise the selection.
  const highlighted = scenes.find((s) => s.id === (highlightId ?? activeId)) ?? active;

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

  // Called by the timeline when a boundary is dragged to a new position.
  const handleMoveBoundary = async (sceneId: number, newEnd: number) => {
    try {
      await moveSceneBoundary(sceneId, newEnd);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not update scene timing');
    }
  };

  // Called by the timeline when a scene's LEFT edge is dragged to a new position.
  const handleMoveStart = async (sceneId: number, newStart: number) => {
    try {
      await moveSceneStart(sceneId, newStart);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not update scene timing');
    }
  };

  // Called by the timeline when the OVERFLOWING last scene's right edge is
  // dragged (to pull its tail back within the video).
  const handleResizeEnd = (sceneId: number, newEnd: number) => {
    try {
      resizeSceneEnd(sceneId, newEnd);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not resize the scene');
    }
  };

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
            Download Script
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

      {/* Timeline — the primary timing surface: drag a scene's edge to resize it. */}
      <Box px="lg" py="md" bg="var(--mantine-color-dark-7)" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group justify="space-between" mb="xs">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
            Timeline
          </Text>
          <Text size="xs" c="dimmed">
            Drag a scene's edge to make it longer or shorter · {scenes.length} scenes
          </Text>
        </Group>
        <SceneTimeline
          scenes={scenes}
          activeId={highlighted.id}
          onSelect={selectScene}
          onMoveBoundary={handleMoveBoundary}
          onMoveStart={handleMoveStart}
          onResizeEnd={handleResizeEnd}
          onSeek={(time) => setSeekTime(time)}
          videoDuration={videoDuration}
          playheadTime={playheadTime}
        />
      </Box>

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
                  active={scene.id === highlighted.id}
                  onClick={() => selectScene(scene.id)}
                />
              ))}
            </Stack>
          </Box>
        </Grid.Col>

        {/* Detail area: persistent inline viewer (left) + per-scene editor (right) */}
        <Grid.Col span={{ base: 12, md: 9, lg: 9 }}>
          <Grid gap={0}>
            {/* Persistent full-preview viewer — clicking a scene seeks it here. */}
            <Grid.Col span={{ base: 12, lg: 5 }} style={{ padding: 'var(--mantine-spacing-lg)' }}>
              <Box style={{ position: 'sticky', top: 16 }}>
                {active && (
                  <InlinePreview
                    videoUrl={videoUrl}
                    audioUrl={audioUrl}
                    scenes={scenes}
                    activeScene={active}
                    seekToken={seekToken}
                    seekTime={seekTime}
                    onSceneChange={setHighlightId}
                    onDuration={setVideoDuration}
                    onPlayhead={setPlayheadTime}
                  />
                )}
              </Box>
            </Grid.Col>
            {/* Per-scene editor */}
            <Grid.Col span={{ base: 12, lg: 7 }}>
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

/**
 * A time-bound horizontal timeline: the track represents the full video
 * duration (fixed), and each scene is a proportional block positioned by its
 * start/end. Dragging the boundary between two scenes moves the cut — scene N's
 * end and scene N+1's start both slide to the new position, so the total video
 * length never changes.
 */
function SceneTimeline({
  scenes,
  activeId,
  onSelect,
  onMoveBoundary,
  onMoveStart,
  onResizeEnd,
  onSeek,
  videoDuration,
  playheadTime,
}: {
  scenes: SceneModel[];
  activeId: number;
  onSelect: (id: number) => void;
  onMoveBoundary: (sceneId: number, newEnd: number) => void;
  onMoveStart: (sceneId: number, newStart: number) => void;
  /** Called when the OVERFLOWING last scene's right edge is dragged — lets the
   *  user pull the tail back within the video length. */
  onResizeEnd?: (sceneId: number, newEnd: number) => void;
  /** Called with an exact time (seconds) when the user clicks/scrubs the track
   *  to seek the playhead there (may be mid-scene). */
  onSeek?: (seconds: number) => void;
  /** Real source-media duration (seconds). When provided, scenes whose end
   *  exceeds this are flagged as "extended beyond the video" so the user can
   *  adjust neighbours to fit. */
  videoDuration?: number | null;
  /** Live playhead time (seconds) — draws a visible scrub head on the track. */
  playheadTime?: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    sceneId: number;
    side: 'left' | 'right';
    sceneStart: number;
    sceneEnd: number;
    origBound: number; // the boundary being moved (start for left, end for right)
    minBound: number;
    maxBound: number;
    startClientX: number;
    total: number;
    resizeTail?: boolean; // true when dragging the overflowing LAST scene's right edge
  } | null>(null);
  const [dragInfo, setDragInfo] = useState<{ newBound: number } | null>(null);
  // Which boundary is hovered (key like "left-<id>" / "right-<id>") so the
  // thin visible divider can highlight subtly before the user grabs it.
  const [hoverBoundary, setHoverBoundary] = useState<string | null>(null);
  // True while the user is dragging the playhead to scrub; lets the track keep
  // seeking on pointer-move instead of only on a single click.
  const scrubbingRef = useRef(false);

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !onSeek) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(frac * total);
  };

  const lastId = scenes[scenes.length - 1]?.id;
  // Fixed total = video length. Never changes during a boundary drag.
  const total = Math.max(1, ...scenes.map((s) => s.endSeconds));
  // Where the real footage ends (if known). Scenes past this overrun the video.
  const mediaEnd = videoDuration && videoDuration > 0 ? videoDuration : total;
  const hasOverflow = mediaEnd < total;

  const beginDrag = (e: React.PointerEvent, scene: SceneModel, side: 'left' | 'right') => {
    e.stopPropagation();
    const el = trackRef.current;
    if (!el) return;
    const idx = scenes.findIndex((s) => s.id === scene.id);
    if (idx === -1) return;
    const prev = scenes[idx - 1];
    const next = scenes[idx + 1];
    if (side === 'right') {
      // The last scene normally has no right boundary (fixed total). BUT if it
      // OVERFLOWS past the video, let the user drag its right edge in to pull
      // the tail back within the footage.
      if (!next && !(onResizeEnd && scene.endSeconds > mediaEnd + 0.05)) return;
      const resizeTail = !next;
      dragRef.current = {
        sceneId: scene.id,
        side,
        sceneStart: scene.startSeconds,
        sceneEnd: scene.endSeconds,
        origBound: scene.endSeconds,
        // Shrink only (pull the right edge in toward the footage end).
        minBound: scene.startSeconds + 0.3,
        maxBound: scene.endSeconds,
        startClientX: e.clientX,
        total,
        resizeTail,
      };
    } else {
      if (!prev) return; // first scene has no left boundary
      dragRef.current = {
        sceneId: scene.id,
        side,
        sceneStart: scene.startSeconds,
        sceneEnd: scene.endSeconds,
        origBound: scene.startSeconds,
        minBound: prev.startSeconds + 0.3,
        maxBound: scene.endSeconds - 0.3,
        startClientX: e.clientX,
        total,
      };
    }
    el.setPointerCapture(e.pointerId);
    setDragInfo({ newBound: dragRef.current.origBound });
  };

  const moveDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = trackRef.current;
    if (!drag || !el) return;
    const pxMoved = e.clientX - drag.startClientX;
    const secondsPerPx = drag.total / (el.offsetWidth || 1);
    const raw = drag.origBound + pxMoved * secondsPerPx;
    const newBound = Math.min(Math.max(raw, drag.minBound), drag.maxBound);
    setDragInfo({ newBound: Math.round(newBound * 100) / 100 });
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = trackRef.current;
    if (drag && el) {
      const pxMoved = e.clientX - drag.startClientX;
      const secondsPerPx = drag.total / (el.offsetWidth || 1);
      const raw = drag.origBound + pxMoved * secondsPerPx;
      const newBound = Math.min(Math.max(raw, drag.minBound), drag.maxBound);
      const bounded = Math.round(newBound * 100) / 100;
      if (Math.abs(bounded - drag.origBound) > 0.1) {
        if (drag.resizeTail) {
          onResizeEnd?.(drag.sceneId, bounded);
        } else if (drag.side === 'right') {
          onMoveBoundary(drag.sceneId, bounded);
        } else {
          onMoveStart(drag.sceneId, bounded);
        }
      }
    }
    dragRef.current = null;
    setDragInfo(null);
    if (el) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    }
  };

  const activeScene = scenes.find((s) => s.id === activeId) ?? scenes[0];
  const draggingScene = dragRef.current ? scenes.find((s) => s.id === dragRef.current!.sceneId) : null;
  const dragDuration =
    draggingScene && dragInfo
      ? dragRef.current?.side === 'right'
        ? dragInfo.newBound - draggingScene.startSeconds
        : draggingScene.endSeconds - dragInfo.newBound
      : 0;

  return (
    <Stack gap={8}>
      <Box
        ref={trackRef}
        onPointerDown={(e) => {
          // Grab the playhead: seek to the exact point and keep scrubbing while
          // the pointer moves (so the user can drag the head anywhere). Scene
          // blocks stopPropagation, so this fires on the track background AND on
          // the dedicated playhead handle (see playhead marker below, which is
          // also the scrub grab point at higher z-index).
          if (dragInfo) return; // not while resizing a scene boundary
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
        onPointerMove={(e) => {
          if (scrubbingRef.current) {
            seekFromClientX(e.clientX);
            return;
          }
          moveDrag(e);
        }}
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
        }}
        style={{
          position: 'relative',
          height: 72,
          width: '100%',
          borderRadius: 'var(--mantine-radius-md)',
          background: 'var(--mantine-color-dark-6)',
          border: '1px solid var(--mantine-color-default-border)',
          overflow: 'hidden',
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'pointer',
        }}
      >
        {/* Time ruler ticks + start/end */}
        <Text size="xs" c="dimmed" style={{ position: 'absolute', left: 6, top: 4, pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}>
          0:00
        </Text>
        {[0.25, 0.5, 0.75].map((frac) => (
          <Box
            key={frac}
            style={{
              position: 'absolute',
              left: `${frac * 100}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'var(--mantine-color-dark-4)',
            }}
          />
        ))}
        <Text size="xs" c="dimmed" style={{ position: 'absolute', right: 6, top: 4, pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}>
          {formatSecondsLabel(total)}
        </Text>

        {/* Video-end boundary + overflow region: if any scene extends past the
            real footage length, shade that region red and mark the end line so
            the user sees exactly how much overruns and can adjust neighbours. */}
        {hasOverflow && (
          <>
            <Box
              style={{
                position: 'absolute',
                left: `${(mediaEnd / total) * 100}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: 'var(--mantine-color-red-6)',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            />
            <Box
              style={{
                position: 'absolute',
                left: `${(mediaEnd / total) * 100}%`,
                right: 0,
                top: 0,
                bottom: 0,
                background: 'rgba(250,82,82,0.12)',
                borderLeft: '2px dashed var(--mantine-color-red-6)',
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />
            <Badge
              size="xs"
              color="red"
              variant="filled"
              style={{ position: 'absolute', left: `${(mediaEnd / total) * 100}%`, top: -6, transform: 'translateX(-50%)', zIndex: 4, pointerEvents: 'none' }}
            >
              video ends
            </Badge>
          </>
        )}

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
                top: 0,
                bottom: 0,
                width: 3,
                background: '#fff',
                boxShadow: '0 0 0 1px rgba(124,58,237,0.35), 0 0 8px rgba(255,255,255,0.8)',
                pointerEvents: 'none',
              }}
            />
            <Box
              style={{
                position: 'absolute',
                top: -3,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop: '9px solid #fff',
                filter: 'drop-shadow(0 1px 2px rgba(124,58,237,0.4))',
                pointerEvents: 'none',
              }}
            />
          </Box>
        )}

        {scenes.map((scene, i) => {
          const isLast = scene.id === lastId;
          const isFirst = i === 0;
          const isActive = scene.id === activeId;
          // A scene "overflows" when it extends past the real footage length.
          const overflows = scene.endSeconds > mediaEnd + 0.05;
          const drag = dragRef.current;
          const dragging = drag && dragInfo && drag.sceneId === scene.id;
          const dragLeftNeighbor = drag && dragInfo && drag.side === 'left' && scenes[i + 1]?.id === drag.sceneId;
          const dragRightNeighbor = drag && dragInfo && drag.side === 'right' && scenes[i - 1]?.id === drag.sceneId;

          // Compute live left edge + live right edge during a drag.
          let liveLeft = scene.startSeconds;
          let liveEnd = scene.endSeconds;
          if (drag && dragInfo) {
            if (dragLeftNeighbor) liveLeft = dragInfo.newBound;
            else if (dragRightNeighbor) liveEnd = dragInfo.newBound;
            else if (dragging && drag.side === 'left') liveLeft = dragInfo.newBound;
            else if (dragging && drag.side === 'right') liveEnd = dragInfo.newBound;
          }
          const left = (liveLeft / total) * 100;
          const width = (Math.max(0, liveEnd - liveLeft) / total) * 100;
          const duration = formatDelta(Math.max(0, liveEnd - liveLeft));

          return (
            <Box
              key={scene.id}
              onPointerDown={(e) => {
                if (dragInfo) return;
                e.stopPropagation(); // scene click = scene-start seek, not track seek
                onSelect(scene.id);
              }}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${Math.max(1.2, width)}%`,
                top: 22,
                bottom: 12,
                borderRadius: 8,
                background: isActive
                  ? 'var(--mantine-color-violet-6)'
                  : 'var(--mantine-color-violet-4)',
                opacity: isActive ? 1 : 0.8,
                cursor: 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                border: isActive
                  ? '2px solid rgba(255,255,255,0.45)'
                  : overflows
                  ? '2px solid var(--mantine-color-red-6)'
                  : 'none',
                boxShadow: overflows ? '0 0 0 1px var(--mantine-color-red-6)' : undefined,
                minWidth: 22,
                transition: 'background 120ms ease',
              }}
            >
              <Stack gap={0} align="center" style={{ pointerEvents: 'none', minWidth: 0 }}>
                <Text size="sm" fw={700} c="white" lh={1.2}>
                  {overflows ? '⚠' : String(scene.number).padStart(2, '0')}
                </Text>
                {width > 7 && (
                  <Text size="xs" c="white" opacity={0.9} lh={1.2} style={{ whiteSpace: 'nowrap' }}>
                    {duration}
                  </Text>
                )}
              </Stack>

              {/* Draggable LEFT edge (only for non-first scenes) — stretch the start.
                  Wide invisible hitbox (~11px each side) so the thin divider is
                  easy to grab; only this hitbox shows the ew-resize cursor. */}
              {!isFirst && (
                <Box
                  onPointerDown={(e) => beginDrag(e, scene, 'left')}
                  onMouseEnter={() => setHoverBoundary(`left-${scene.id}`)}
                  onMouseLeave={() => setHoverBoundary((h) => (h === `left-${scene.id}` ? null : h))}
                  style={{
                    position: 'absolute',
                    left: -11,
                    top: -22,
                    bottom: -12,
                    width: 22,
                    cursor: 'ew-resize',
                    zIndex: 3,
                  }}
                >
                  <Box
                    style={{
                      position: 'absolute',
                      top: 22,
                      bottom: 12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: hoverBoundary === `left-${scene.id}` ? 6 : 3,
                      background:
                        hoverBoundary === `left-${scene.id}` ? '#fff' : isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                      borderRadius: 2,
                      transition: 'width 120ms ease, background 120ms ease',
                    }}
                  />
                </Box>
              )}

              {/* Draggable boundary — between scenes, OR the right edge of an
                  overflowing last scene (so its tail can be pulled back in). */}
              {(!isLast || (isLast && overflows && !!onResizeEnd)) && (
                <Box
                  onPointerDown={(e) => beginDrag(e, scene, 'right')}
                  onMouseEnter={() => setHoverBoundary(`right-${scene.id}`)}
                  onMouseLeave={() => setHoverBoundary((h) => (h === `right-${scene.id}` ? null : h))}
                  style={{
                    position: 'absolute',
                    right: -11,
                    top: -22,
                    bottom: -12,
                    width: 22,
                    cursor: 'ew-resize',
                    zIndex: 3,
                  }}
                >
                  <Box
                    style={{
                      position: 'absolute',
                      top: 22,
                      bottom: 12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: hoverBoundary === `right-${scene.id}` ? 6 : 3,
                      background:
                        hoverBoundary === `right-${scene.id}` ? '#fff' : isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                      borderRadius: 2,
                      transition: 'width 120ms ease, background 120ms ease',
                    }}
                  />
                </Box>
              )}
            </Box>
          );
        })}

        {/* Live size bubble while dragging a boundary */}
        {draggingScene && dragInfo && dragRef.current && (
          <Box
            style={{
              position: 'absolute',
              left: `${Math.max(0, Math.min(100, (dragInfo.newBound / total) * 100))}%`,
              top: 0,
              transform: 'translateX(-50%)',
              background: '#fff',
              color: 'var(--mantine-color-violet-7)',
              borderRadius: 999,
              padding: '2px 10px',
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: 'var(--mantine-shadow-md)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            {String(draggingScene.number).padStart(2, '0')} · {formatDelta(dragDuration)}
          </Box>
        )}
      </Box>

      {/* Active scene readout — clear, non-technical pacing info */}
      <Group justify="space-between" px={2}>
        <Text size="sm" fw={600} lineClamp={1}>
          Scene {String(activeScene.number).padStart(2, '0')}
        </Text>
        <Group gap="md">
          <Text size="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatSecondsLabel(activeScene.startSeconds)} – {formatSecondsLabel(activeScene.endSeconds)}
          </Text>
          <Badge variant="light" color="violet" size="sm">
            {formatDelta(activeScene.endSeconds - activeScene.startSeconds)}
          </Badge>
        </Group>
      </Group>

      {/* Overflow warning — a scene extends past the footage, so the user can
          pull neighbours' edges to bring it back within the video. */}
      {hasOverflow && (
        <Text size="xs" c="red" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
          <IconAlertCircle size={14} />
          Some scenes extend past the video length — drag a scene edge to fit it
          back within the footage ({formatDelta(mediaEnd)}).
        </Text>
      )}
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

  // When the selected scene changes (user click on a sidebar/timeline item),
  // seek the playhead to that scene's start and PAUSE, so the highlight lands
  // reliably on the scene the user clicked and stays there (full control).
  // It never fires during plain playback, so continuous playing is never
  // interrupted at scene boundaries. The seekToken dep guarantees a re-seek on
  // EVERY click, even when clicking the scene that is already active.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const target = Math.max(0, activeScene.startSeconds);
    el.pause();
    setPlaying(false);
    // Only move if we're meaningfully off-target (avoid jitter on same-spot).
    if (Math.abs(el.currentTime - target) > 0.05 || !playing) {
      el.currentTime = target;
      setPlayTime(target);
    }
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
    el.currentTime = Math.max(0, activeScene.startSeconds);
    setPlaying(true);
    setPlayTime(activeScene.startSeconds);
    void el.play().catch(() => undefined);
  };

  const stopPlayback = () => {
    mediaRef.current?.pause();
    setPlaying(false);
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    setPlayTime(e.currentTarget.currentTime);
  };

  // Scene whose generated image overlays the video at the current playhead.
  const overlayScene =
    scenes.find((s) => playTime >= s.startSeconds && playTime < s.endSeconds) ??
    scenes[scenes.length - 1] ??
    null;
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
              : 'var(--mantine-color-violet-1)',
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
                    color="violet"
                    radius="xl"
                    size={60}
                    aria-label="Play"
                    onClick={startPlayback}
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.35)', opacity: 0.95 }}
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
                color="violet"
                radius="xl"
                size={60}
                aria-label="Pause"
                onClick={stopPlayback}
                style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.35)', opacity: 0.95 }}
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
              <Text size="xs" c="white" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
          <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatSecondsLabel(activeScene.startSeconds)} – {formatSecondsLabel(activeScene.endSeconds)}
          </Text>
          <Badge variant="light" color="violet" size="xs">
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
  const [prompt, setPrompt] = useState(scene.prompt);
  const [regenerating, setRegenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Change with AI" — inline instruction input (kept separate so it never
  // triggers the manual-prompt autosave).
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReason, setAiReason] = useState<string | null>(null);
  // The prompt is locked (read-only) by default to prevent accidental AI
  // regenerations that spend credits. Unlock before editing.
  const [promptLocked, setPromptLocked] = useState(true);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastHistoryTokenRef = useRef(historyToken);

  // Sync title + prompt edits into the shared scene state. This updates the
  // local draft (written to localStorage instantly) — the backend is ONLY hit on
  // page leave / hide / pause, so no per-change network calls.
  //
  // When historyToken changes (an undo/redo just restored a snapshot), we DON'T
  // autosave — instead we sync the field back to the restored scene so the stale
  // keystroke we were about to re-apply doesn't wipe the undo (the root cause of
  // "undo works then loses control").
  useEffect(() => {
    if (lastHistoryTokenRef.current !== historyToken) {
      lastHistoryTokenRef.current = historyToken;
      setTitle(scene.title);
      setPrompt(scene.prompt);
      return;
    }
    const changed = title !== scene.title || prompt !== scene.prompt;
    if (!changed) return;
    const t = window.setTimeout(() => {
      updateScene(scene.id, { scene_title: title, image_prompt: prompt });
      setSaved(true);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => setSaved(false), 2000);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, prompt, scene.id, scene.title, scene.prompt, historyToken]);

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

  // "Change with AI": revise the prompt from a short instruction + regenerate.
  const handleChangeWithAI = async () => {
    const instruction = aiInstruction.trim();
    if (!instruction) {
      setError('Tell us what you would like to change first.');
      return;
    }
    setAiBusy(true);
    setError(null);
    try {
      const updated = await changeWithAI(scene.id, instruction);
      // Reflect the revised prompt in the editor + reset the instruction field.
      setPrompt(updated.prompt);
      setAiReason((updated as SceneModel & { reason?: string }).reason ?? 'Updated.');
      setAiOpen(false);
      setAiInstruction('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change with AI');
    } finally {
      setAiBusy(false);
    }
  };

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

      <Stack gap="md">
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
                <Group justify="space-between" align="center">
                  <Text size="xs" c="dimmed">
                    {prompt.length}/{PROMPT_MAX}
                  </Text>
                  <Button
                    size="xs"
                    variant="light"
                    color="violet"
                    loading={regenerating}
                    disabled={!prompt.trim()}
                    onClick={handleRegenerate}
                  >
                    Regenerate from prompt
                  </Button>
                </Group>
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
                label="Tell the AI what to change — it rewrites the prompt and regenerates the image."
                withArrow
              >
                <span>
                  <Button
                    size="xs"
                    variant="outline"
                    color="violet"
                    leftSection={<IconSparkles size={14} />}
                    onClick={() => {
                      setAiOpen((v) => !v);
                      setAiReason(null);
                    }}
                  >
                    Change with AI
                  </Button>
                </span>
              </Tooltip>
            </Group>

            {aiOpen && (
              <Group gap="xs" align="flex-end" wrap="nowrap">
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
                  color="violet"
                  loading={aiBusy}
                  disabled={!aiInstruction.trim()}
                  onClick={() => void handleChangeWithAI()}
                >
                  Generate
                </Button>
              </Group>
            )}

            {aiReason && (
              <Text size="xs" c="dimmed" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconSparkles size={14} color="var(--mantine-color-violet-6)" />
                {aiReason}
              </Text>
            )}
          </Stack>
        </Card>

        {/* Transition — how this scene's image is shown over the footage */}
        <Card withBorder radius="xl" padding="lg">
          <Stack gap="sm">
            <Text fw={600} size="sm">
              Transition
            </Text>
            <Text size="xs" c="dimmed">
              How the scene image plays over your footage.
            </Text>
            <Select
              data={[
                { value: 'cut', label: 'Cut — plain switch' },
                { value: 'fade', label: 'Fade to black' },
                { value: 'crossfade', label: 'Crossfade with footage' },
                { value: 'kenburns', label: 'Ken Burns (slow zoom)' },
              ]}
              value={scene.transition}
              onChange={(value) => {
                if (!value) return;
                updateScene(scene.id, { transition: value as SceneTransition });
              }}
            />
          </Stack>
        </Card>
      </Stack>

      {/* Footer — undo/redo + destructive delete (everything autosaves, so no Save button) */}
      <Divider my="lg" />
      <Group justify="space-between" align="center" style={{ position: 'sticky', bottom: 0, background: 'var(--mantine-color-body)', padding: '10px 4px', zIndex: 5 }}>
        <Tooltip label="Remove this scene (use Undo to bring it back)" withArrow>
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
