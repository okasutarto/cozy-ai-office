import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const vendorDir = path.join(root, "art/vendor/pixel-office");
const metroCityVendorDir = path.join(root, "art/vendor/metrocity");
const outputDir = path.join(root, "public/assets");
const officeOutputDir = path.join(outputDir, "office");
const charactersOutputDir = path.join(outputDir, "characters");

const officeSourcePath = path.join(vendorDir, "PixelOffice.png");
const charactersSourcePath = path.join(metroCityVendorDir, "CharacterModel/Character Model.png");
const charactersRecipePath = path.join(root, "art/source/characters.json");

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function getSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function getTextSha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath, "utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

function ensureSourceDimensions(image, expectedWidth, expectedHeight, filePath) {
  if (image.width !== expectedWidth || image.height !== expectedHeight) {
    throw new Error(
      `Unexpected source dimensions for ${filePath}: expected ${expectedWidth}x${expectedHeight}, got ${image.width}x${image.height}`,
    );
  }
}

function blitNearest(source, destination, options) {
  const {
    sourceX = 0,
    sourceY = 0,
    sourceWidth,
    sourceHeight,
    destinationX = 0,
    destinationY = 0,
    destinationWidth,
    destinationHeight,
  } = options;

  for (let y = 0; y < destinationHeight; y++) {
    const sourceRow =
      sourceY + Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / destinationHeight));
    for (let x = 0; x < destinationWidth; x++) {
      const sourceColumn =
        sourceX + Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / destinationWidth));
      const sourceIndex = (sourceRow * source.width + sourceColumn) << 2;
      const destinationIndex = ((destinationY + y) * destination.width + destinationX + x) << 2;
      destination.data[destinationIndex] = source.data[sourceIndex];
      destination.data[destinationIndex + 1] = source.data[sourceIndex + 1];
      destination.data[destinationIndex + 2] = source.data[sourceIndex + 2];
      destination.data[destinationIndex + 3] = source.data[sourceIndex + 3];
    }
  }
}

function copyFrameCrop(source, destination, options) {
  const { sourceX, sourceY, destinationX, destinationY, flipX = false } = options;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 16; x++) {
      const sourceColumn = sourceX + (flipX ? 15 - x : x);
      const sourceIndex = ((sourceY + y) * source.width + sourceColumn) << 2;
      const destinationIndex = ((destinationY + y) * destination.width + destinationX + x) << 2;
      destination.data[destinationIndex] = source.data[sourceIndex];
      destination.data[destinationIndex + 1] = source.data[sourceIndex + 1];
      destination.data[destinationIndex + 2] = source.data[sourceIndex + 2];
      destination.data[destinationIndex + 3] = source.data[sourceIndex + 3];
    }
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

fs.mkdirSync(officeOutputDir, { recursive: true });
fs.mkdirSync(charactersOutputDir, { recursive: true });

const officeSource = readPng(officeSourcePath);
const charactersSource = readPng(charactersSourcePath);
ensureSourceDimensions(officeSource, 256, 224, officeSourcePath);
ensureSourceDimensions(charactersSource, 768, 192, charactersSourcePath);

// The source scene is 16:14 while the existing runtime frame is 22:15.
// Crop the source vertically, then scale with nearest-neighbor into that frame.
const officeFrameWidth = 352;
const officeFrameHeight = 240;
const officeAtlas = new PNG({ width: 512, height: 512 });
blitNearest(officeSource, officeAtlas, {
  sourceX: 0,
  sourceY: 24,
  sourceWidth: officeSource.width,
  sourceHeight: 176,
  destinationWidth: officeFrameWidth,
  destinationHeight: officeFrameHeight,
});

const officeFrames = {
  "office.background": {
    frame: { x: 0, y: 0, w: officeFrameWidth, h: officeFrameHeight },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: officeFrameWidth, h: officeFrameHeight },
    sourceSize: { w: officeFrameWidth, h: officeFrameHeight },
    anchor: { x: 0, y: 0 },
  },
};

fs.writeFileSync(path.join(officeOutputDir, "office-atlas.png"), PNG.sync.write(officeAtlas));
writeJson(path.join(officeOutputDir, "office-atlas.json"), {
  frames: officeFrames,
  meta: {
    app: "cozy-agent-office-generator",
    version: "1",
    image: "office-atlas.png",
    format: "RGBA8888",
    size: { w: officeAtlas.width, h: officeAtlas.height },
    scale: "1",
  },
});

const charactersRecipe = JSON.parse(fs.readFileSync(charactersRecipePath, "utf8"));
const actors = charactersRecipe.actors.map((actor) => actor.id);
const animations = charactersRecipe.animations;
const characterAtlas = new PNG({ width: 1024, height: 256 });
const characterFrames = {};
const characterAnimations = {};
const animationSourceMap = {
  idle: { row: 0, columns: [0] },
  "walk.down": { row: 0, columns: [0, 1, 2, 3] },
  "walk.left": { row: 0, columns: [4, 5, 6, 7] },
  "walk.right": { row: 0, columns: [4, 5, 6, 7], flipX: true },
  "walk.up": { row: 1, columns: [0, 1, 2, 3] },
  work: { row: 0, columns: [0, 1, 2, 3] },
  read: { row: 1, columns: [0, 1] },
  talk: { row: 0, columns: [0, 1, 2, 3] },
  test: { row: 0, columns: [4, 5, 6, 7] },
  celebrate: { row: 1, columns: [0, 1, 2, 3] },
  error: { row: 1, columns: [0, 1] },
};
let globalFrameCount = 0;

for (const [actorIndex, actorId] of actors.entries()) {
  const modelOffsetX = (actorIndex % 3) * 256;
  for (const [animationName, frameCount] of Object.entries(animations)) {
    const animationKey = `${actorId}.${animationName}`;
    characterAnimations[animationKey] = [];
    const sourceAnimation = animationSourceMap[animationName];
    if (!sourceAnimation) throw new Error(`Missing MetroCity mapping for ${animationName}`);

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const frameName = `${actorId}.${animationName}.${frameIndex}`;
      const column = globalFrameCount % 64;
      const row = Math.floor(globalFrameCount / 64);
      const frameX = column * 16;
      const frameY = row * 24;
      characterAnimations[animationKey].push(frameName);

      const sourceColumn = sourceAnimation.columns[frameIndex % sourceAnimation.columns.length];
      copyFrameCrop(charactersSource, characterAtlas, {
        sourceX: modelOffsetX + sourceColumn * 32 + 8,
        sourceY: sourceAnimation.row * 32 + 4,
        destinationX: frameX,
        destinationY: frameY,
        flipX: sourceAnimation.flipX,
      });

      characterFrames[frameName] = {
        frame: { x: frameX, y: frameY, w: 16, h: 24 },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: 16, h: 24 },
        sourceSize: { w: 16, h: 24 },
        anchor: { x: 0.5, y: 1 },
      };
      globalFrameCount++;
    }
  }
}

fs.writeFileSync(
  path.join(charactersOutputDir, "characters-atlas.png"),
  PNG.sync.write(characterAtlas),
);
writeJson(path.join(charactersOutputDir, "characters-atlas.json"), {
  frames: characterFrames,
  animations: characterAnimations,
  meta: {
    app: "cozy-agent-office-generator",
    version: "1",
    image: "characters-atlas.png",
    format: "RGBA8888",
    size: { w: characterAtlas.width, h: characterAtlas.height },
    scale: "1",
  },
});

writeJson(path.join(outputDir, "asset-manifest.json"), {
  version: 1,
  tileSize: 16,
  office: {
    width: officeFrameWidth,
    height: officeFrameHeight,
    image: "/assets/office/office-atlas.png",
    atlas: "/assets/office/office-atlas.json",
  },
  characters: {
    frameWidth: 16,
    frameHeight: 24,
    image: "/assets/characters/characters-atlas.png",
    atlas: "/assets/characters/characters-atlas.json",
    actors,
  },
  scaleMode: "nearest",
});

const officeSourceFiles = [
  { path: "art/vendor/pixel-office/PixelOffice.png", hash: "binary" },
  { path: "art/vendor/pixel-office/LargePixelOffice.png", hash: "binary" },
  { path: "art/vendor/pixel-office/LICENSE.txt", hash: "text" },
  { path: "art/vendor/pixel-office/README.txt", hash: "text" },
].map(({ path: relativePath, hash }) => ({
  path: relativePath,
  sha256:
    hash === "text"
      ? getTextSha256(path.join(root, relativePath))
      : getSha256(path.join(root, relativePath)),
}));

const metroCitySourceFiles = [
  { path: "art/vendor/metrocity/CharacterModel/Character Model.png", hash: "binary" },
  { path: "art/vendor/metrocity/LICENSE.txt", hash: "text" },
].map(({ path: relativePath, hash }) => ({
  path: relativePath,
  sha256:
    hash === "text"
      ? getTextSha256(path.join(root, relativePath))
      : getSha256(path.join(root, relativePath)),
}));

const officeOutputFiles = [
  {
    path: "public/assets/office/office-atlas.png",
    frames: ["office.background"],
  },
  {
    path: "public/assets/office/office-atlas.json",
    frames: ["office.background"],
  },
].map((output) => ({
  ...output,
  sha256: getSha256(path.join(root, output.path)),
}));

const metroCityOutputFiles = [
  {
    path: "public/assets/characters/characters-atlas.png",
    frames: Object.keys(characterFrames),
  },
  {
    path: "public/assets/characters/characters-atlas.json",
    frames: Object.keys(characterFrames),
  },
].map((output) => ({
  ...output,
  sha256: getSha256(path.join(root, output.path)),
}));

writeJson(path.join(outputDir, "licenses.json"), {
  version: 1,
  assets: [
    {
      id: "pixel-office-2dpig",
      author: "2dPig",
      sourceUrl: "https://2dpig.itch.io/pixel-office",
      license: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceFiles: officeSourceFiles,
      outputs: officeOutputFiles,
      modifications:
        "PixelOffice.png was cropped and nearest-neighbor scaled into the existing 352x240 office frame. No renderer code or source pixels were synthesized.",
    },
    {
      id: "metrocity-characters-jik-a-4",
      author: "JIK-A-4",
      sourceUrl: "https://jik-a-4.itch.io/metrocity-free-topdown-character-pack",
      license: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceFiles: metroCitySourceFiles,
      outputs: metroCityOutputFiles,
      modifications:
        "Three MetroCity base models were cropped from 32x32 animation cells into the existing 16x24 frame contract. Directional cycles are mapped to the existing animation keys and right-facing frames are mirrored from the left-facing cycle. No renderer code or source pixels were synthesized.",
    },
  ],
});

console.log("Assets successfully generated from vendored PixelOffice and MetroCity PNGs!");
