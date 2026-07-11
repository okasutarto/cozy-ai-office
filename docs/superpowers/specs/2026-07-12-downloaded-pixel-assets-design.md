# Downloaded Pixel Assets Design

## Goal

Replace the generated placeholder office and character artwork with downloaded pixel art while keeping the current renderer and its runtime asset contract unchanged.

## Source

Use the artwork bundled with the open-source Pixel Agents project (`pixel-agents-hq/pixel-agents`). The repository is MIT licensed and targets the same top-down pixel-office use case. Preserve the upstream license and attribution in this repository's third-party notices and asset metadata.

## Integration

- Import upstream source PNGs into a clearly named vendor directory under `art/vendor/`.
- Repack the imported artwork into the existing output files:
  - `public/assets/office/office-atlas.png`
  - `public/assets/office/office-atlas.json`
  - `public/assets/characters/characters-atlas.png`
  - `public/assets/characters/characters-atlas.json`
- Preserve the existing office background frame, actor IDs, animation keys, frame sizes, atlas URLs, and nearest-neighbor scale mode.
- Do not modify `OfficeScene`, `OfficeCanvas`, `CharacterSprite`, `asset-manifest`, or any other renderer/runtime source.

## Adaptation Rules

The downloaded source format may differ from Cozy Agent Office's atlas format. A build-time asset preparation step may crop, position, compose, recolor, or repeat source frames as needed, but it must not synthesize replacement artwork or change runtime behavior. Missing semantic states may reuse the nearest available imported frame so every existing animation key remains valid.

## Licensing

Record the upstream repository URL, license, imported source files, modifications, and generated outputs in `public/assets/licenses.json` and the repository's third-party notice. Keep a copy of the applicable upstream license beside the vendored files.

## Verification

- Run asset validation and the existing office tests.
- Confirm every JSON frame lies within its PNG bounds.
- Confirm all current actor and animation keys still resolve.
- Launch the app and visually verify the office background, character alignment, transparency, nearest-neighbor scaling, and animation playback.

## Non-goals

- No renderer changes.
- No gameplay, layout, state-machine, or UI changes.
- No paid or redistribution-restricted asset packs.
