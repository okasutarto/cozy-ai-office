# Pixel Office PNG Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace generated placeholder art with the user-provided CC0 PixelOffice and MetroCity PNGs while preserving the runtime renderer contract.

**Architecture:** Vendor office PNGs under `art/vendor/pixel-office/` and the MetroCity animated character sheet under `art/vendor/metrocity/`. Make `scripts/generate-assets.mjs` read those files, compose a 352x240 office frame inside the existing 512x512 office atlas, and crop animated 32x32 character cells into the existing 16x24 frames inside the 1024x256 character atlas. Keep all actor/animation keys generated from the existing animation recipe and reuse source cycles for missing states.

**Tech Stack:** Node.js 24, `pngjs`, PixiJS spritesheets, Vitest/Playwright, Prettier.

## Global Constraints

- Keep `OfficeScene`, `OfficeCanvas`, `CharacterSprite`, `asset-manifest.ts`, station coordinates, canvas dimensions, atlas URLs, and nearest-neighbor rendering unchanged.
- Use only the local PixelOffice and MetroCity PNGs and CC0 license records; no build-time network dependency.
- Preserve all 336 existing character frame keys and animation frame counts.
- Keep generated office atlas at 512x512 and character atlas at 1024x256 so existing validation remains valid.

### Task 1: Vendor the downloaded PNG source

**Files:**

- Create: `art/vendor/pixel-office/PixelOffice.png`
- Create: `art/vendor/pixel-office/LargePixelOffice.png`
- Create: `art/vendor/pixel-office/PixelOfficeAssets.png`
- Create: `art/vendor/pixel-office/LICENSE.txt`
- Create: `art/vendor/pixel-office/README.txt`
- Create: `art/vendor/metrocity/CharacterModel/Character Model.png`
- Create: `art/vendor/metrocity/LICENSE.txt`

- [x] Extract the five source files from `C:/Users/USER/Downloads/PixelOffice.zip` into `art/vendor/pixel-office/` and vendor the MetroCity animated character sheet.
- [x] Verify the source dimensions are 256x224, 1024x896, and 256x160 for the three PNGs.
- [x] Verify the vendored licenses are CC0 and retain the original attributions.

### Task 2: Replace procedural generation with deterministic PNG composition

**Files:**

- Modify: `scripts/generate-assets.mjs`

- [x] Read `art/source/characters.json` only for the existing actor IDs and animation frame counts.
- [x] Compose the 352x240 office frame by nearest-neighbor scaling `PixelOffice.png` to fill width 352, cropping source rows 24 through 199, then place it at `(0,0)` in a transparent 512x512 atlas.
- [x] Crop MetroCity's 32x32 directional cells into 16x24 frames, mirror the side cycle for right-facing movement, and preserve the existing 64-column atlas packing and JSON frame metadata.
- [x] Map actor index modulo three to MetroCity's base models and preserve actual walk-cycle frame changes.
- [x] Generate `asset-manifest.json` with the existing runtime paths and dimensions.
- [x] Generate `licenses.json` with CC0 source hashes, transformation notes, and output hashes.

### Task 3: Update license and validation metadata

**Files:**

- Modify: `ASSET_LICENSE.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `scripts/validate-assets.mjs`

- [x] Change the repository art notice from CC-BY-4.0 to CC0 for the vendored PixelOffice source.
- [x] Add the 2dPig and JIK-A-4 source URLs, CC0 URLs, and attribution notes to third-party notices.
- [x] Update validation to expect the same 512x512 and 1024x256 atlas dimensions but require both CC0 license records and vendor source hashes.

### Task 4: Generate and verify the replacement

**Files:**

- Modify: generated files under `public/assets/`

- [x] Run `npm run assets:generate` with the project Node 24 runtime.
- [x] Run `npm run assets:check` and confirm all frame bounds, hashes, keys, and licenses pass.
- [x] Run `npm run format:check`, `npm run typecheck`, and the office/auth tests.
- [x] Refresh the running dev app and verify the new background and characters visually at nearest-neighbor scale.
- [x] Record the final generated hashes and ensure only intended files are changed.
