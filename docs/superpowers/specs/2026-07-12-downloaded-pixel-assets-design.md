# Downloaded Pixel Office PNG Integration

## Goal

Replace the generated placeholder office art with the user-provided
`PixelOffice.zip` PNGs and replace placeholder characters with the downloaded
MetroCity animated PNGs while keeping the existing renderer, runtime asset URLs,
actor IDs, station layout, and nearest-neighbor rendering unchanged.

## Source

Use the local archive at `C:/Users/USER/Downloads/PixelOffice.zip`, authored by
2dPig, for the office scene. Use the downloaded MetroCity character sheet at
`C:/Users/USER/Downloads/MetroCity/CharacterModel/Character Model.png`,
authored by JIK-A-4, for animated characters. Both sources are CC0. Vendor the
selected PNGs and license records under `art/vendor/`; do not depend on the
Downloads folder at build time.

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
- Crop MetroCity's 32x32 directional frames into the existing `16x24` frame
  contract, map three source models across the seven existing actor IDs, and
  mirror the side-facing cycle for the opposite direction.
- Reuse the closest available source frame for non-directional states while
  preserving actual walk cycles for `walk.*`. Every existing actor/animation
  key must remain resolvable.

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
