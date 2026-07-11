# Downloaded Pixel Office PNG Integration

## Goal

Replace the generated placeholder office and character art with the user-provided
`PixelOffice.zip` PNGs while keeping the existing renderer, runtime asset URLs,
actor IDs, station layout, and nearest-neighbor rendering unchanged.

## Source

Use the local archive at `C:/Users/USER/Downloads/PixelOffice.zip`, authored by
2dPig. The archive contains `PixelOffice.png` (256x224),
`LargePixelOffice.png` (1024x896), `PixelOfficeAssets.png` (256x160), and a
CC0 license. Vendor the selected PNGs and license under
`art/vendor/pixel-office/`; do not depend on the Downloads folder at build time.

## Integration contract

- Keep `OfficeScene`, `OfficeCanvas`, `CharacterSprite`, `asset-manifest.ts`,
  station coordinates, and canvas dimensions unchanged.
- Continue emitting the existing output files:
  - `public/assets/office/office-atlas.png`
  - `public/assets/office/office-atlas.json`
  - `public/assets/characters/characters-atlas.png`
  - `public/assets/characters/characters-atlas.json`
- Use `PixelOffice.png` as the office scene source and deterministically fit it
  into the existing `352x240` background frame without filtering.
- Crop character cells from `PixelOfficeAssets.png`, center them in the existing
  `16x24` frame contract, and map the five source characters across the seven
  existing actor IDs.
- Reuse the closest available source frame for missing animation states or
  frame counts. Every existing actor/animation key must remain resolvable.

## Build and licensing

- Replace procedural placeholder drawing in `scripts/generate-assets.mjs` with a
  deterministic source-vendor composition step; no new artwork is synthesized.
- Record the source archive, imported PNGs, CC0 license URL, transformations,
  and generated output hashes in `public/assets/licenses.json`.
- Update `THIRD_PARTY_NOTICES.md` and keep the source `LICENSE.txt` beside the
  vendored PNGs.

## Verification

- Run `npm run assets:check`, `npm run format:check`, and `npm run typecheck`.
- Confirm all atlas frames are inside PNG bounds and all existing animation keys
  resolve.
- Run the office unit tests and browser E2E/visual checks where supported.
- Launch the dev app and visually verify the imported background, character
  alignment, transparency, nearest-neighbor scaling, and state transitions.

## Non-goals

- No renderer or gameplay changes.
- No new external network dependency at build time.
- No paid or redistribution-restricted assets.
