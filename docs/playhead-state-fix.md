# Playhead and selection fix milestone

This note records the real milestone that fixed one of the core timeline bugs: the editor was treating selection and playback position as the same state.

## The bug

The timeline had a hidden state problem:

- a user-selected scene
- the scene currently highlighted by the playhead
- the current scrubbed time inside the media
- the scene the app thought was "active"

These were being merged together.

Because of that, selecting a scene could force a seek back to the scene start, even after the user had already scrubbed to a different point inside the same scene.

That made the timeline feel unstable and made playback appear to restart from the beginning of the scene instead of continuing from the actual point the user had chosen.

## The actual fix

The fix was to separate these responsibilities:

- selectedSceneId: user intent / chosen scene
- playbackSceneId: current highlight from the playhead
- playTime / seekTime: actual media position

The important rule is:

- selecting a scene may jump to its start when the user explicitly chooses that scene
- but scrubbing or playing should continue from the current playhead position unless the user intentionally selects a new scene

In other words, selection and playhead are no longer the same concept.

## Why this mattered

This resolves a major timeline inconsistency:

- a scene selection is not the same as a media scrub position
- a selected scene should not overwrite a deliberate in-scene location
- playback should resume from the current cursor, not from a stale scene origin

## The interaction contract after the fix

1. Tap or select a scene -> choose that scene as the editor target.
2. Explicit scene selection may jump the preview to that scene start.
3. Scrubbing inside the timeline updates the actual playhead time.
4. Pressing play resumes from the current playhead, not from an old scene anchor.
5. Playback highlight can still move independently and reflect the current scene the video is in.

## Why this was a milestone

This was a real state-model fix, not just a visual tweak.

It corrected the root cause behind the flaky timeline behavior described in the timeline fix plan: the editor had multiple overlapping sources of truth for one concept.

Once selection, playback highlight, and media position are separated, the later UI polish and lock affordances become much easier to reason about and maintain.
