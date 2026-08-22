# Timeline fix plan

This document captures the actual product and engineering direction for fixing the editor timeline without turning it into a fragile one-off patch.

## Completed milestones

These items are already implemented and should be treated as the baseline contract going forward:

- lock/unlock handling is in place for scenes and editing is protected by default
- selection and playback highlight are separated so scene choice and media position no longer fight each other
- empty gaps between scenes now keep the raw video visible instead of falling back to the last scene image in export/preview

## The real issue

The timeline is not a single broken widget. It is a coordination problem between several overlapping state sources:

- scene selection
- playback highlight
- scrub/seek time
- drag-resize state
- scene mutation in the context store
- accidental touch input on mobile
- layout constraints on small screens

The UI behaves incorrectly because these concerns are partially merged instead of clearly separated.

## Core product decisions

### 1) Generated scenes should not be accidentally editable

Your observation is correct: not every generation flow needs AI scenes to be instantly editable. In many editors, generated scenes are valid but safe until the user explicitly chooses to edit them.

Recommendation:

- new scenes start in a locked state
- user must unlock a scene before moving or resizing
- accidental touch or tiny pointer drift should not alter the scene timing

This is the single most important safeguard for the timeline.

### 2) Mobile editing should be landscape-first

The editor should assume landscape mode for mobile editing, like CapCut and InShot.

Recommendation:

- detect phone-sized devices
- if portrait mode is detected, show a landscape-required warning or gate before editing
- keep the default flow optimized for landscape, not portrait

This is a product decision, not just a CSS tweak.

### 3) The editor should feel native, not crowded

A web editor on mobile should not feel like a desktop timeline crammed into a phone.

Recommendation:

- compact timeline interactions for mobile
- keep AI/regenerate functions near the selected scene, not spread through the full timeline row
- hide less important controls behind a compact action menu when the screen gets tight

### 4) Default protection should be stronger than default editing

The default state for a scene should be safe.

Recommendation:

- generated scenes start locked
- selection remains possible
- drag/resize remains impossible until unlock
- AI and metadata actions still remain accessible

---

## State model to fix first

The next engineering task is to cleanly separate the editor states.

### Define these clearly

- `selectedSceneId`: the user-selected scene
- `playbackSceneId`: the scene currently being highlighted by the playhead
- `seekTime`: explicit time from scrub or timeline click
- `sceneLockedMap`: whether a scene can be moved or resized
- `dragMode`: `idle | move | resize | scrub`

### Important rule

Selection, playback, and editing must not all read from the same state variable.

Right now, the current editor mixes several responsibilities in the same component. That is why it feels unstable when the playhead, selection, and scene mutation all update at once.

---

## Recommended interaction rules

### Empty track area

- scrub/playhead only
- no scene mutation
- no resize or move

### Scene body

- select the scene
- if unlocked, allow drag/move
- if locked, ignore the drag unless the user explicitly unlocks

### Edge handles

- resize only
- only active when unlocked
- require clear visual affordance

### Small movement threshold

- do not begin a drag on a tiny movement offset
- treat light taps as selection, not editing

This alone will remove a lot of accidental timeline damage.

---

## Timeline fix order

### Phase 1: protect the editor from accidental edits

1. add `locked` state to scene model or local editing state
2. default new scenes to locked
3. add explicit unlock interaction
4. add drag threshold before move/resize begins
5. block edge drag when scene is locked

This is the first milestone because it prevents bad user behavior before it happens.

### Phase 2: fix selection vs highlight separation

1. separate `selectedSceneId` from `playbackSceneId`
2. keep highlight for playback only
3. keep selection for user intent only
4. avoid reusing a single active ID for both concerns

This is the main state fix behind the timeline instability.

### Phase 3: make mobile safe

1. detect phone-sized viewports
2. show a landscape-required message when portrait is detected
3. lock editing until the device is in a supported orientation
4. keep the first-release flow landscape-first

This makes the editing workflow feel intentional and native, not cramped.

### Phase 4: clean up timeline dragging rules

1. empty track = scrub only
2. scene body = move/select
3. edge handle = resize only
4. snap rules should be centralized and deterministic
5. do not scatter special-case logic across multiple handlers

### Phase 5: move AI actions out of the timeline noise

1. keep AI controls near the selected scene
2. hide extra controls in compact mobile action rows
3. do not overload the timeline with every action on every scene

### Phase 6: finalize usability and polish

1. compress timeline density on mobile
2. maintain readable labels and timecodes
3. ensure comfort for thumb-based use in landscape mode
4. leave enough whitespace so the timeline does not feel congested

---

## What should be fixed in code first

The highest-value files are:

- [src/studio/views/EditorView.tsx](src/studio/views/EditorView.tsx)
- [src/studio/VideoFlowContext.tsx](src/studio/VideoFlowContext.tsx)
- [src/studio/views/CreateView.tsx](src/studio/views/CreateView.tsx)
- [src/global.css](src/global.css)

### In EditorView

Focus on:

- selected scene state
- highlight state
- seek state
- drag threshold logic
- locked/unlocked scene interactions
- mobile portrait gating

### In VideoFlowContext

Focus on:

- resizeScene
- moveScene
- history / undo / redo
- scene creation defaults
- clamping and overlap rules

### In CreateView

Focus on:

- generated scene creation flow
- whether new scenes start locked
- any AI or regeneration entry points that should be scene-local

---

## Suggested implementation strategy

### Step 1: write a tiny interaction contract

Create a simple list of accepted interactions:

- tap scene = select
- drag scene body = move if unlocked
- drag edge = resize if unlocked
- drag empty space = scrub
- lock = no mutation allowed

Once that is written, all UI decisions can follow it.

### Step 2: add a default lock state

Do not start with a big UI redesign. Start with behavior.

- generated scenes start locked
- selection still works
- unlocking is explicit

### Step 3: handle portrait mode before editing

If on phone + portrait:

- show a warning banner or modal
- disable the timeline editing layer
- allow preview only or continue at user risk

### Step 4: fix state ownership

This is where the editor becomes understandable.

Make a rule:

- the app state owns scene timing
- the view owns UI intent
- the playhead and selection are separate concepts

### Step 5: polish after logic is stable

Once accidental edits are prevented and the state model is clean, then deal with:

- compact mobile layout
- tiny action buttons
- better spacing
- timeline readability

---

## What to avoid

Avoid these traps:

- adding more visual complexity before fixing the interaction rules
- mixing selection and playhead highlight
- letting scene edits happen on any pointer drag
- trying to fix every timeline issue with one giant patch
- designing for portrait on mobile before landscape-first assumptions are settled

---

## Recommended first test cases

After the first fix, validate these manually:

1. new scene is created and stays locked
2. tapping a scene does not resize it
3. tiny accidental movement does not move or resize it
4. portrait mode shows the landscape warning
5. highlight and selection stay consistent while scrubbing
6. undo/redo still restores the previous timeline state

---

## Conclusion

The right approach is not to keep patching timeline behavior in place. The right approach is to define the actual contract for the editor first:

- safe by default
- explicit unlock to edit
- landscape-first on mobile
- separate selection from playback highlight
- scene actions near the selected scene
- no accidental resizing

That is the foundation for a timeline that feels intentional instead of fragile.
