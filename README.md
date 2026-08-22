# Studio Timeline & Editor Guide

This app is a video-scene editor. It turns a source video or audio file into a sequence of scenes, lets the user trim/move/reorder scenes, and previews the result in both inline and modal modes.

This document is meant to explain the code structure and the timeline behavior so you can fix the inconsistencies without guessing.

## 1. High-level purpose

The app has three major responsibilities:

1. Upload media and process it into scenes.
2. Let a user edit scene timing and metadata in the editor.
3. Preview the result in either:
   - inline preview inside the editor
   - modal scene/full preview

The main logic lives here:

- src/studio/VideoFlowContext.tsx
  - source of truth for scene data and timeline mutations
- src/studio/views/EditorView.tsx
  - editor UI, timeline rendering, playhead, dragging, scrubbing
- src/studio/views/PreviewModal.tsx
  - full preview / scene preview navigation
- src/lib/api.ts
  - backend API contracts and formatting helpers

---

## 2. Core data model: SceneModel

The scene model is defined in VideoFlowContext.tsx.

It contains:

- id
- number
- start / end as formatted labels like MM:SS
- startSeconds / endSeconds as numeric time values
- title, narration, description
- imageUrl
- pauseAfter
- edited
- regenerateCount
- order
- transition

This is the important bit: the timeline logic is mostly numeric, while the UI labels are formatted strings for display.

The conversion from backend DTO to UI scene model happens in toSceneModel().

Important rule:
- startSeconds and endSeconds are the real timeline values.
- number is the visible scene index, not the source of truth for position.

That distinction is one of the biggest sources of confusion in this codebase.

---

## 3. Where the timeline state lives

The real timeline state is stored in VideoFlowContext.tsx.

This provider manages:

- scenes: SceneModel[]
- trackerId / job status / media URLs
- undo / redo history stacks
- local draft persistence to localStorage
- scene editing actions like:
  - updateScene
  - addScene
  - deleteScene
  - resizeScene
  - moveScene
  - undo / redo

The timeline is not stored in one dedicated timeline object. Instead, the scene array itself is the timeline state.

Every mutating action updates the scene list and recalculates the visual track from the scene times.

---

## 4. Timeline invariants the code is trying to enforce

The implementation intentionally tries to keep the timeline consistent.

### 4.1 No overlaps

In resizeScene() and moveScene(), the app clamps new values using neighboring scenes.

The rules are:

- left edge cannot move before previous scene end
- right edge cannot move past next scene start
- scene minimum duration is protected by MIN_SCENE_DURATION = 0.3

This means the timeline is deliberately designed as a non-overlapping sequence, not as a free-moving arrangement.

### 4.2 Duration is capped by media length

In SceneTimeline, total is computed like this:

- use actual videoDuration if known and larger than zero
- otherwise fall back to furthest scene end

So the timeline width is supposed to reflect real media duration, not just the sum of scene lengths.

This is important because there are separate concepts:

- scene length (start/end time)
- full media duration
- visual track width

If they drift apart, the visual timeline can appear stretched or misaligned.

### 4.3 Scene numbers are display labels, not ordering truth

The UI often displays scene.number, which is generated from order + 1.

But time ordering is determined by startSeconds, not by number.

That is a subtle but critical design bug pattern:

- a scene may visually sit after another scene but still keep an old number
- a user can drag a scene to a new slot and it may still be reported as its previous number unless the ordering is rebuilt correctly

This is why a lot of “reordering acts weird” issues happen: the code mixes visual number semantics and temporal ordering semantics.

---

## 5. How the editor timeline actually works

The main timeline rendering lives in SceneTimeline() inside EditorView.tsx.

It does several things:

1. Measures the track width with ResizeObserver.
2. Converts seconds to percentages using pxPerSec and total.
3. Renders a ruler with timestamp ticks.
4. Draws a playhead on top.
5. Draws each scene as a block with left/right trim handles.

### Drag behaviors

There are two drag types:

- edge drag: trim the start or end of a scene
- move drag: drag the whole scene while keeping its duration constant

These are defined in SceneTimeline in EditorView.tsx.

The pointer moves call:

- onResize(sceneId, side, newTime)
- or onMoveScene(sceneId, newStart)

Those callbacks are wired to VideoFlowContext methods.

### Snapping rules

The track snaps to:

- track start (0)
- track end (total)
- playhead time
- other scene boundaries

The logic is in snapTargets() and applySnap().

This is intentionally a “magnetic timeline”: if you drag near an existing boundary or the current playhead, it jumps to that anchor.

That makes editing feel smooth, but it also creates friction when the user expects exact free time placement.

---

## 6. Playhead logic and the weird seek behavior

This is the critical part behind the inconsistent playback issues you noticed.

### 6.1 There are two types of “seek”

In EditorView.tsx, `seekTime` is a parent-controlled exact time to jump to.

That is used when the user clicks or scrubs the timeline.

At the same time, playing media is governed by the inline preview player, which recalculates the current scene from the current playhead time.

The problem is that the app mixes:

- user-selected scene start
- playhead time
- nearest active scene
- render-driven highlight

The code tries to reconcile all of them, but there is no single canonical “timeline cursor” with consistent semantics.

### 6.2 Scene selection with playback

In EditorView:

- `selectScene()` sets activeId and highlightId
- `highlighted` scene is chosen from either highlightId or activeId
- the inline preview is told to seek to a certain time when the user chooses a scene

The comment in the code literally says this is intended to keep the highlight and seek in sync.

But it also means the UI can decide “nearest scene” and “playhead position” in different ways, which creates the sort of jumpiness you described.

### 6.3 Why playing then pausing then playing may jump

The inline preview logic in InlinePreview() has this pattern:

- there is an effect that seeks to activeScene.startSeconds when active scene changes
- there is another effect that seeks to seekTime when seekTime changes
- startPlayback() sets currentTime to activeScene.startSeconds before begin playback

This means the system is treating a scene as the canonical playback start, even when the user has scrubbed to an arbitrary time in the middle of the track.

So if the user drags the playhead and then pauses, the next play action may re-anchor itself to the scene boundary instead of the current time.

This is the root pattern behind the “play from the cursor, but it jumps to scene start” issue.

---

## 7. Preview modal navigation is scene-based, not time-based

The full preview is in PreviewModal.tsx.

The next/previous buttons are implemented as:

- goTo(scenes.indexOf(...) +/- 1)

This means it jumps to scene start times, not to a fixed time offset.

That matches your desired UX in a way, but it makes behavior brittle because it depends on:

- current overlayScene detection
- scene order being correct
- scene numbers matching the real order
- the scene array not drifting out of temporal order

This is why the preview prev/next buttons can feel unreliable even though they are intentionally “scene-based.”

---

## 8. Last-scene problems and “timeline shake”

The last scene is special because it has no next neighbor.

In resizeScene() and moveScene(), the right edge of the last scene is clamped using:

- mediaDuration if available
- otherwise its own end

This means the last scene has different constraints from the middle scenes.

When you stretch or drag the last scene, it can affect:

- total track width
- playhead routing
- overlayScene detection
- the final audio/video media end

This is a common place for weird shake/jitter because the app is deciding between:

- real media duration
- furthest scene end
- last scene’s current end
- next scene start if present

The code tries to reconcile all of them, but the last scene has no stable boundary on one side.

---

## 9. Why the timeline can stretch past actual video duration

There are two separate calculations involved:

1. total track length
2. actual media duration

In SceneTimeline, total is set as:

- max(videoDuration, maxSceneEnd)

This intentionally allows the track to be longer than the real duration when a scene extends past it or when the media metadata is not known yet.

That creates a subtle issue:

- the track can visually extend beyond the actual media
- dragging near the end can push the far edge past the source video
- the playhead may be allowed to position beyond the actual end
- the overlay scene logic may still be derived from scene windows, not actual media duration

This is likely one of the reasons the timeline sometimes “feels wider than the video” even when the source is finite.

---

## 10. Reordering scenes: the real challenge

The app supports dragging a scene to a different place. The code does this by changing its startSeconds with moveScene().

But the scene order is not truly rebuilt as an independent timeline ordering. It is implicitly based on:

- the scene array order
- startSeconds values
- maybe number field / order field

This leads to the pathologies you saw:

- moving a scene to the right of another can leave the visible number stale
- when saved, the scene may have a different identity than its displayed slot
- order and timing are being treated as the same thing, but they are not

If you want to fix the reordering behavior, the key is to separate:

- temporal ordering (sorted by startSeconds)
- visual/slot ordering (array order or display number)
- persistent scene identity (id)

Right now those are mixed.

---

## 11. Important functions to study in order

If you want to debug timeline logic, read these in this order:

1. src/studio/VideoFlowContext.tsx
   - SceneModel
   - resizeScene
   - moveScene
   - undo / redo
   - fetchScenes

2. src/studio/views/EditorView.tsx
   - EditorView state for playhead, active scene, seek token, seek time
   - SceneTimeline
   - InlinePreview
   - handlePointerMove and pointer drag logic

3. src/studio/views/PreviewModal.tsx
   - goTo()
   - seekTo()
   - prev/next scene logic
   - overlayScene calculation

4. src/lib/api.ts
   - formatSeconds / formatDelta
   - scene transition helpers
   - data conversion utilities

---

## 12. Debugging checklist for the timeline issues

When you investigate a bug, check these in order.

### A. What is the current source of truth?

Ask:

- Is the code using scene.startSeconds or scene.number?
- Is the array order sorted or unsorted?
- Does the timeline rely on the parent `scenes` array or on derived values?

### B. What is the value of total?

Check SceneTimeline total and compare to:

- actual media duration
- furthest endSeconds
- last scene endSeconds

If total is larger than videoDuration, the timeline will visually stretch beyond the actual media.

### C. Are playhead and selected scene being treated separately?

Look for the interplay between:

- activeId
- highlightId
- seekTime
- playheadTime
- activeScene
- overlayScene

If these are not unified, the user will see jumps back to the nearest scene boundary.

### D. Is the last scene being handled as a special case?

The last scene has no next neighbor. This is where many clamp calculations go wrong.

### E. Is temporal ordering still derived from stale array order?

After dragging a scene, confirm:

- scene array order matches startSeconds order
- scene.number reflects the actual position
- the preview and timeline are reading the same ordering

---

## 13. Practical mental model

The easiest way to understand this code is:

- `scenes` is the timeline
- each scene is a time window on one shared media track
- dragging edges modifies time bounds
- dragging whole scenes repositions time bounds but preserves duration
- the UI uses numbers and labels to display things, but the real logic is all based on second values
- scene identity is id, while scene order is derived from timing and array state

This app is trying to do "drag a precise time window on a real media timeline" with a lot of UI conveniences layered over it: snapping, selection, preview overlays, local storage, and undo history.

That makes it powerful, but it also means the bugs appear when the code has conflicting definitions of “current scene,” “current time,” or “correct order.”

---

## 14. Recommended next step

If you plan to fix the timeline, do not start by patching the UI.

Start here:

1. normalize the timeline rules in one central place
2. define a single source of truth for ordering and current time
3. separate scene identity from scene number from scene temporal position
4. test precise scenarios:
   - scrub to an arbitrary time and play
   - drag last scene edge
   - move a scene past another scene
   - preview next/previous scene navigation
   - drag while media is playing

The core issue is not a single broken widget — it is that the app currently has multiple competing notions of timeline state.

That is the real bug cluster to solve.
