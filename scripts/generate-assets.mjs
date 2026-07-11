import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const vendorDir = path.join(root, "art/vendor/pixel-office");
const outputDir = path.join(root, "public/assets");
const officeOutputDir = path.join(outputDir, "office");
const charactersOutputDir = path.join(outputDir, "characters");

const officeSourcePath = path.join(vendorDir, "PixelOffice.png");
const charactersSourcePath = path.join(vendorDir, "PixelOfficeAssets.png");
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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

fs.mkdirSync(officeOutputDir, { recursive: true });
fs.mkdirSync(charactersOutputDir, { recursive: true });

const officeSource = readPng(officeSourcePath);
const charactersSource = readPng(charactersSourcePath);
ensureSourceDimensions(officeSource, 256, 224, officeSourcePath);
ensureSourceDimensions(charactersSource, 256, 160, charactersSourcePath);

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
const sourceCells = [
  { x: 0, y: 112 },
  { x: 16, y: 112 },
  { x: 32, y: 112 },
  { x: 0, y: 128 },
  { x: 16, y: 128 },
];
let globalFrameCount = 0;

for (const [actorIndex, actorId] of actors.entries()) {
  const sourceCell = sourceCells[actorIndex % sourceCells.length];
  for (const [animationName, frameCount] of Object.entries(animations)) {
    const animationKey = `${actorId}.${animationName}`;
    characterAnimations[animationKey] = [];

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const frameName = `${actorId}.${animationName}.${frameIndex}`;
      const column = globalFrameCount % 64;
      const row = Math.floor(globalFrameCount / 64);
      const frameX = column * 16;
      const frameY = row * 24;
      characterAnimations[animationKey].push(frameName);

      blitNearest(charactersSource, characterAtlas, {
        sourceX: sourceCell.x,
        sourceY: sourceCell.y,
        sourceWidth: 16,
        sourceHeight: 16,
        destinationX: frameX,
        destinationY: frameY + 8,
        destinationWidth: 16,
        destinationHeight: 16,
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

const sourceFiles = [
  { path: "art/vendor/pixel-office/PixelOffice.png", hash: "binary" },
  { path: "art/vendor/pixel-office/LargePixelOffice.png", hash: "binary" },
  { path: "art/vendor/pixel-office/PixelOfficeAssets.png", hash: "binary" },
  { path: "art/vendor/pixel-office/LICENSE.txt", hash: "text" },
  { path: "art/vendor/pixel-office/README.txt", hash: "text" },
].map(({ path: relativePath, hash }) => ({
  path: relativePath,
  sha256:
    hash === "text"
      ? getTextSha256(path.join(root, relativePath))
      : getSha256(path.join(root, relativePath)),
}));

const outputFiles = [
  {
    path: "public/assets/office/office-atlas.png",
    frames: ["office.background"],
  },
  {
    path: "public/assets/office/office-atlas.json",
    frames: ["office.background"],
  },
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
      sourceFiles,
      outputs: outputFiles,
      modifications:
        "PixelOffice.png was cropped and nearest-neighbor scaled into the existing 352x240 office frame. Five 16x16 character cells from PixelOfficeAssets.png were centered in 16x24 frames and reused across existing actor animation keys. No renderer code or source pixels were synthesized.",
    },
  ],
});

console.log("Assets successfully generated from vendored PixelOffice PNGs!");
