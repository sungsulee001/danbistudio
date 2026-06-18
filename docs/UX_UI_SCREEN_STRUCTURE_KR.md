# Danbi Studio UX/UI Screen Structure

Date: 2026-06-18

Related documents:

- `docs/UX_STRUCTURE_DESIGN_KR.md`
- `docs/POST_2026_06_17_23_CHANGELOG_KR.md`
- `docs/ELECTRON_LOCAL_INSTALLED_ACCEPTANCE_KR.md`

## Purpose

This document defines the UX/UI restructuring direction for Danbi Studio after the local installed-app release-blocker fixes.

The current installed app exposes too many editor, AI, automation, render, diagnostic, and platform controls on one page. That makes the app difficult to understand even when the underlying features work.

This UX plan was written after Local Installed-App Acceptance passed locally. It does not redefine release approval. Fresh Windows evidence and final release approval remain external pending items.

The UX goal is not to remove advanced functionality. Danbi Studio must remain a local-first video editor and orchestration platform. The UI should separate workflows, reveal advanced controls progressively, and keep the main editing path understandable.

Detailed UX structure, state model, user flows, and phased migration plan are defined in `docs/UX_STRUCTURE_DESIGN_KR.md`.

## Product Position

Danbi Studio is not a simple single-purpose video cutter.

It is:

- a local video editor
- a packaged Electron desktop app
- a media import and render pipeline
- a ComfyUI generation workflow host
- an AI results manager
- an automation/orchestration platform
- a render worker and headless render platform
- a plugin/extension host

The UI must make this power usable without presenting every subsystem at once.

## Core UX Principle

The first screen should answer one question:

What can the user do next?

It should not act as a complete feature catalog.

Advanced systems remain first-class, but they move into dedicated views, drawers, panels, dialogs, or status surfaces.

## Top-Level Information Architecture

Danbi Studio should be organized into these top-level areas:

1. Project Hub
2. Editor Workspace
3. AI Studio
4. Automation
5. Render Queue
6. Extensions
7. Settings and Diagnostics

The initial screen should be Project Hub, not the full editor surface with every feature exposed.

## Global App Shell

The packaged app should use a persistent shell:

- left rail or compact sidebar for top-level navigation
- top bar for active project, save state, render status, and global commands
- main content area for the selected workflow
- optional right drawer for contextual details
- status bar for FFmpeg, storage, ComfyUI, worker, and background job health

The app shell should avoid marketing-style sections. Danbi Studio is an operational creative tool, so density, predictability, and scanability matter more than decorative layout.

## Screen 1: Project Hub

Purpose:

Help the user start or resume work.

Primary content:

- Recent projects
- New project
- Open project
- Open packaged sample project
- Import media into new project
- Last render output

Secondary status:

- Local storage path health
- FFmpeg availability
- ComfyUI connection summary
- Worker status summary
- Plugin system status

Do not show:

- full ComfyUI workflow list
- all automation hooks
- all render worker settings
- plugin internals
- diagnostic logs

Expected layout:

- main area: recent projects and start actions
- right panel: compact environment status
- bottom status strip: local acceptance/runtime health indicators

## Screen 2: Editor Workspace

Purpose:

Provide the core video editing workflow.

Layout:

- top toolbar: import, save, undo/redo, export, render status
- left panel: media bin, project assets, AI results tab
- center: preview monitor
- bottom: timeline
- right panel: inspector for selected clip, asset, track, or timeline item

The editor should be usable without opening automation, plugin, or diagnostics screens.

Primary editor actions:

- import media
- drag media to timeline
- trim and arrange clips
- preview timeline
- inspect clip properties
- export current project

Important behavior:

- missing media and pending generated assets should appear as explicit states
- the timeline should not become unusable when ComfyUI is unavailable
- export preflight should explain blockers in a focused panel

## Screen 3: AI Studio

Purpose:

Keep ComfyUI and AI generation first-class without crowding the main editor.

AI Studio contains:

- ComfyUI workflow browser
- generation queue
- generation settings
- AI Results library
- generated asset history
- failed generation recovery

Asset states:

- pending generation
- generating
- generated
- failed

Required actions for pending or failed assets:

- generate now
- skip this asset
- replace with local media
- exclude from current export

Rules:

- ComfyUI must not be removed, bypassed, disabled, downgraded, mocked, excluded, or made optional as a product capability.
- The editor must remain usable when ComfyUI is unavailable.
- Unavailable ComfyUI should produce actionable states, not a broken editor.
- Existing export validation semantics for ComfyUI generation must remain intact unless explicitly changed by product decision.

## Screen 4: Automation

Purpose:

Provide orchestration controls without overloading the editing screen.

Automation contains:

- automation hooks
- workflow triggers
- batch jobs
- handoff points
- job history
- integration logs

This screen is for users who intentionally operate Danbi Studio as a workflow platform.

The editor screen should show only compact automation status, such as:

- active jobs count
- failed jobs count
- last automation event
- open Automation button

## Screen 5: Render Queue

Purpose:

Make render activity visible and controllable.

Render Queue contains:

- current render
- queued renders
- completed renders
- failed renders
- render worker status
- render worker daemon status
- headless render jobs
- output locations

Expected states:

- idle
- queued
- rendering
- completed
- failed
- canceled

This screen should not replace the editor export dialog. It is the operational view for render execution and history.

## Screen 6: Extensions

Purpose:

Manage plugin and extension capabilities without mixing them into the default editor surface.

Extensions contains:

- installed plugins
- plugin package install
- signing state
- permissions
- plugin health
- extension sandbox status

Rules:

- Plugin/Extension architecture remains first-class.
- Plugin controls should be discoverable but not shown as core editing controls.
- Risky plugin operations should be explicit and confirmable.

## Screen 7: Settings and Diagnostics

Purpose:

Move environment, storage, and runtime diagnostics out of the main editor page.

Settings and Diagnostics contains:

- FFmpeg discovery
- ffprobe discovery
- storage paths
- Electron userData path
- ComfyUI endpoint settings
- render worker settings
- fleet discovery settings
- logs
- crash diagnostics
- release/local acceptance status
- license and third-party notices

This screen can be dense because it is an operational diagnostics area.

## Export Preflight UX

Export should open a dedicated preflight panel or modal.

Preflight sections:

- output profile
- timeline range
- media availability
- generated asset state
- ComfyUI generation requirements
- FFmpeg availability
- output path
- expected warnings
- blockers

Severity levels:

- blocker: export cannot proceed
- warning: export can proceed with risk or degraded result
- info: non-blocking context

ComfyUI-related unresolved assets should expose user actions:

- generate now
- skip this asset
- replace with local media
- exclude from current export

Do not silently bypass existing validation semantics.

## Navigation Model

Recommended navigation:

- Project Hub
- Editor
- AI Studio
- Automation
- Render Queue
- Extensions
- Settings

The app should preserve the active project while switching views.

The user should be able to return to Editor from any screen with one action.

## Progressive Disclosure Rules

Default visible:

- project actions
- media import
- timeline editing
- preview
- export
- active warnings

Visible only when relevant:

- ComfyUI generation controls
- automation hooks
- render worker daemon controls
- fleet discovery
- plugin signing
- raw diagnostics

Never hidden from product:

- ComfyUI
- AI Results
- automation
- render workers
- headless render
- plugin/extension system

The distinction is visibility by workflow, not removal of capability.

## Implementation Phases

### Phase 1: Navigation and Screen Separation

- introduce app shell navigation
- move Project Hub to first screen
- keep Editor as primary workspace
- move diagnostics away from the main editor surface

### Phase 2: Editor Workspace Cleanup

- split media bin, AI results, preview, timeline, and inspector
- reduce all-in-one panels
- keep export as a clear toolbar action
- add contextual empty states

### Phase 3: AI Studio

- move ComfyUI workflow list and generation queue into AI Studio
- show AI asset states consistently
- add generate, skip, replace, and exclude actions
- keep AI Results accessible from Editor as a tab or drawer

### Phase 4: Automation and Render Queue

- move automation hooks and worker controls into dedicated screens
- add compact status indicators in the editor shell
- make render queue history visible

### Phase 5: Settings and Diagnostics

- consolidate storage, FFmpeg, ComfyUI endpoint, worker, plugin, logs, and release acceptance diagnostics
- surface Local Installed-App Acceptance status without mixing it into editing controls

## Acceptance Criteria

The UX restructuring is successful when:

- a new user can start from Project Hub without seeing every advanced subsystem
- the Editor screen shows only controls needed for editing, preview, import, and export
- ComfyUI remains first-class but is not dumped into the default editor page
- Automation, Render Worker, Fleet Discovery, Headless Render, and Plugin/Extension systems remain available in dedicated screens
- pending generated assets have explicit states and actions
- export preflight clearly separates blockers, warnings, and info
- Settings and Diagnostics contain runtime details instead of the main editor
- no existing orchestration architecture is removed or downgraded for UX simplification

## Non-Goals

This UX plan does not authorize:

- removing ComfyUI functionality
- bypassing ComfyUI workflows
- making ComfyUI a fake or mocked feature
- removing automation hooks
- removing render worker or daemon behavior
- removing fleet discovery
- removing headless render
- removing plugin or extension architecture
- weakening export validation semantics

The goal is to make Danbi Studio understandable, not smaller.
