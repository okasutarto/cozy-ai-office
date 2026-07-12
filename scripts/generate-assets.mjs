import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pixelOfficeVendorDir = path.join(root, "art/vendor/pixel-office");
const characterVendorDir = path.join(
  root,
  "art/vendor/ordinary-bumblebee/32x32 Customizable Character Pack",
);
const outputDir = path.join(root, "public/assets");
const officeOutputDir = path.join(outputDir, "office");
const charactersOutputDir = path.join(outputDir, "characters");
const officeSourcePath = path.join(pixelOfficeVendorDir, "PixelOffice.png");
const charactersRecipePath = path.join(root, "art/source/characters.json");

const OFFICE_WIDTH = 768;
const OFFICE_HEIGHT = 288;
const OFFICE_ATLAS_WIDTH = 1024;
const OFFICE_ATLAS_HEIGHT = 512;
const CHARACTER_FRAME_SIZE = 32;
const CHARACTER_ATLAS_WIDTH = 1024;
const CHARACTER_ATLAS_HEIGHT = 512;

const visualAnimations = {
  "idle.down": { source: "Idle", direction: "Front", frames: 4 },
  "idle.left": { source: "Idle", direction: "Left", frames: 4 },
  "idle.right": { source: "Idle", direction: "Right", frames: 4 },
  "idle.up": { source: "Idle", direction: "Back", frames: 4 },
  "walk.down": { source: "Walk", direction: "Front", frames: 4 },
  "walk.left": { source: "Walk", direction: "Left", frames: 4 },
  "walk.right": { source: "Walk", direction: "Right", frames: 4 },
  "walk.up": { source: "Walk", direction: "Back", frames: 4 },
  "work.up": { source: "Interact", direction: "Back", frames: 3 },
  "read.down": { source: "Idle", direction: "Front", frames: 4 },
  "talk.down": { source: "Interact", direction: "Front", frames: 3 },
  "test.up": { source: "Interact", direction: "Back", frames: 3 },
  "celebrate.down": { source: "Jump", direction: "Front", frames: 3 },
  "error.down": { source: "Hurt", direction: "Front", frames: 3 },
};

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function textSha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath, "utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureDimensions(image, width, height, filePath) {
  if (image.width !== width || image.height !== height) {
    throw new Error(
      `Unexpected dimensions for ${filePath}: expected ${width}x${height}, got ${image.width}x${image.height}`,
    );
  }
}

function alphaBlit(source, destination, options) {
  const { sourceX, sourceY, width, height, destinationX, destinationY } = options;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceOffset = ((sourceY + y) * source.width + sourceX + x) * 4;
      const destinationOffset = ((destinationY + y) * destination.width + destinationX + x) * 4;
      const alpha = source.data[sourceOffset + 3] / 255;
      if (alpha === 0) continue;
      const inverseAlpha = 1 - alpha;
      destination.data[destinationOffset] = Math.round(
        source.data[sourceOffset] * alpha + destination.data[destinationOffset] * inverseAlpha,
      );
      destination.data[destinationOffset + 1] = Math.round(
        source.data[sourceOffset + 1] * alpha +
          destination.data[destinationOffset + 1] * inverseAlpha,
      );
      destination.data[destinationOffset + 2] = Math.round(
        source.data[sourceOffset + 2] * alpha +
          destination.data[destinationOffset + 2] * inverseAlpha,
      );
      destination.data[destinationOffset + 3] = Math.round(
        source.data[sourceOffset + 3] + destination.data[destinationOffset + 3] * inverseAlpha,
      );
    }
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
      const sourceOffset = (sourceRow * source.width + sourceColumn) * 4;
      const destinationOffset = ((destinationY + y) * destination.width + destinationX + x) * 4;
      destination.data.set(source.data.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
    }
  }
}

function characterLayerPath(source, category, direction) {
  const prefix = path.join(characterVendorDir, source);
  if (category === "Character") {
    return path.join(prefix, category, `Character_${source}_${direction}-Sheet.png`);
  }
  if (category === "Hair") {
    return path.join(prefix, category, `Hair_${source}_${direction}-Sheet.png`);
  }
  if (category === "Eyes") {
    return path.join(prefix, category, `Eyes_${source}_${direction}-Sheet.png`);
  }
  const fileCategory = category === "Top" ? "Tops" : category;
  const idleBackName =
    source === "Idle" && category === "Top" && direction === "Back"
      ? "Clothing_Top_Idle_Back-Sheet.png"
      : `Clothing_${fileCategory}_${source}_${direction}-Sheet.png`;
  return path.join(prefix, "Clothing", idleBackName);
}

const sheetCache = new Map();
function layerSheet(source, category, direction) {
  if (category === "Eyes" && direction === "Back") return null;
  const filePath = characterLayerPath(source, category, direction);
  if (!sheetCache.has(filePath)) sheetCache.set(filePath, readPng(filePath));
  return sheetCache.get(filePath);
}

function compositeCharacterFrame(destination, destinationX, destinationY, preset, visual) {
  const layers = [
    ["Character", preset.skin],
    ["Bottoms", preset.bottom],
    ["Shoes", preset.shoes],
    ["Top", preset.top],
    ["Eyes", preset.eyes],
    ["Hair", preset.hair],
  ];
  for (const [category, variantRow] of layers) {
    const sheet = layerSheet(visual.source, category, visual.direction);
    if (!sheet) continue;
    if (sheet.width !== visual.frames * CHARACTER_FRAME_SIZE || sheet.height < 32) {
      throw new Error(`Unexpected character sheet geometry for ${category} ${visual.source}`);
    }
    alphaBlit(sheet, destination, {
      sourceX: visual.frameIndex * CHARACTER_FRAME_SIZE,
      sourceY: variantRow * CHARACTER_FRAME_SIZE,
      width: CHARACTER_FRAME_SIZE,
      height: CHARACTER_FRAME_SIZE,
      destinationX,
      destinationY,
    });
  }
}

function walkFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walkFiles(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    )
    .sort((left, right) => left.localeCompare(right));
}

fs.mkdirSync(officeOutputDir, { recursive: true });
fs.mkdirSync(charactersOutputDir, { recursive: true });

const officeSource = readPng(officeSourcePath);
ensureDimensions(officeSource, 256, 224, officeSourcePath);
const officeAtlas = new PNG({ width: OFFICE_ATLAS_WIDTH, height: OFFICE_ATLAS_HEIGHT });
blitNearest(officeSource, officeAtlas, {
  sourceX: 0,
  sourceY: 24,
  sourceWidth: 256,
  sourceHeight: 176,
  destinationWidth: OFFICE_WIDTH,
  destinationHeight: OFFICE_HEIGHT,
});
for (const [sourceX, sourceY, destinationX] of [
  [384, 160, 768],
  [384, 0, 800],
  [384, 32, 832],
]) {
  alphaBlit(officeAtlas, officeAtlas, {
    sourceX,
    sourceY,
    width: 32,
    height: 32,
    destinationX,
    destinationY: 0,
  });
}
const officeFrame = (x, y, w, h) => ({
  frame: { x, y, w, h },
  rotated: false,
  trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w, h },
  sourceSize: { w, h },
  anchor: { x: 0, y: 0 },
});
const officeFrames = {
  "office.background": officeFrame(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT),
  "office.floor": officeFrame(768, 0, 32, 32),
  "office.wall": officeFrame(800, 0, 32, 32),
  "office.wallBase": officeFrame(832, 0, 32, 32),
};
fs.writeFileSync(path.join(officeOutputDir, "office-atlas.png"), PNG.sync.write(officeAtlas));
writeJson(path.join(officeOutputDir, "office-atlas.json"), {
  frames: officeFrames,
  meta: {
    app: "cozy-agent-office-generator",
    version: "2",
    image: "office-atlas.png",
    format: "RGBA8888",
    size: { w: OFFICE_ATLAS_WIDTH, h: OFFICE_ATLAS_HEIGHT },
    scale: "1",
  },
});

const recipe = JSON.parse(fs.readFileSync(charactersRecipePath, "utf8"));
const actors = recipe.actors.map((actor) => actor.id);
const characterAtlas = new PNG({
  width: CHARACTER_ATLAS_WIDTH,
  height: CHARACTER_ATLAS_HEIGHT,
});
const characterFrames = {};
const characterAnimations = {};
let globalFrameIndex = 0;

for (const actor of recipe.actors) {
  for (const [animationName, visual] of Object.entries(visualAnimations)) {
    const animationKey = `${actor.id}.${animationName}`;
    characterAnimations[animationKey] = [];
    for (let frameIndex = 0; frameIndex < visual.frames; frameIndex++) {
      const frameName = `${animationKey}.${frameIndex}`;
      const column = globalFrameIndex % (CHARACTER_ATLAS_WIDTH / CHARACTER_FRAME_SIZE);
      const row = Math.floor(globalFrameIndex / (CHARACTER_ATLAS_WIDTH / CHARACTER_FRAME_SIZE));
      const frameX = column * CHARACTER_FRAME_SIZE;
      const frameY = row * CHARACTER_FRAME_SIZE;
      compositeCharacterFrame(characterAtlas, frameX, frameY, actor, {
        ...visual,
        frameIndex,
      });
      characterAnimations[animationKey].push(frameName);
      characterFrames[frameName] = {
        frame: { x: frameX, y: frameY, w: CHARACTER_FRAME_SIZE, h: CHARACTER_FRAME_SIZE },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: CHARACTER_FRAME_SIZE, h: CHARACTER_FRAME_SIZE },
        sourceSize: { w: CHARACTER_FRAME_SIZE, h: CHARACTER_FRAME_SIZE },
        anchor: { x: 0.5, y: 1 },
      };
      globalFrameIndex++;
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
    version: "2",
    image: "characters-atlas.png",
    format: "RGBA8888",
    size: { w: CHARACTER_ATLAS_WIDTH, h: CHARACTER_ATLAS_HEIGHT },
    scale: "1",
  },
});

writeJson(path.join(outputDir, "asset-manifest.json"), {
  version: 2,
  tileSize: 16,
  office: {
    width: OFFICE_WIDTH,
    height: OFFICE_HEIGHT,
    image: "/assets/office/office-atlas.png",
    atlas: "/assets/office/office-atlas.json",
  },
  characters: {
    frameWidth: CHARACTER_FRAME_SIZE,
    frameHeight: CHARACTER_FRAME_SIZE,
    image: "/assets/characters/characters-atlas.png",
    atlas: "/assets/characters/characters-atlas.json",
    actors,
  },
  scaleMode: "nearest",
});

const officeSourceFiles = [
  "PixelOffice.png",
  "LargePixelOffice.png",
  "LICENSE.txt",
  "README.txt",
].map((name) => {
  const filePath = path.join(pixelOfficeVendorDir, name);
  return {
    path: path.relative(root, filePath).replaceAll("\\", "/"),
    sha256: name.endsWith(".txt") ? textSha256(filePath) : sha256(filePath),
  };
});
const characterSourceFiles = walkFiles(characterVendorDir).map((filePath) => ({
  path: path.relative(root, filePath).replaceAll("\\", "/"),
  sha256: filePath.endsWith(".txt") ? textSha256(filePath) : sha256(filePath),
}));
const outputRecord = (relativePath, frames) => ({
  path: relativePath,
  frames,
  sha256: sha256(path.join(root, relativePath)),
});

writeJson(path.join(outputDir, "licenses.json"), {
  version: 2,
  assets: [
    {
      id: "pixel-office-2dpig",
      author: "2dPig",
      sourceUrl: "https://2dpig.itch.io/pixel-office",
      license: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceFiles: officeSourceFiles,
      outputs: [
        outputRecord("public/assets/office/office-atlas.png", Object.keys(officeFrames)),
        outputRecord("public/assets/office/office-atlas.json", Object.keys(officeFrames)),
      ],
      modifications: "Cropped and nearest-neighbor scaled into the 768x288 public fallback frame.",
    },
    {
      id: "ordinary-bumblebee-customizable-characters",
      author: "Ordinary Bumblebee",
      sourceUrl: "https://ordinary-bumblebee.itch.io/customizable-character-pack",
      license: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceFiles: characterSourceFiles,
      outputs: [
        outputRecord("public/assets/characters/characters-atlas.png", Object.keys(characterFrames)),
        outputRecord(
          "public/assets/characters/characters-atlas.json",
          Object.keys(characterFrames),
        ),
      ],
      modifications:
        "Body, clothing, shoes, eyes, and hair layers were composited into seven 32x32 role presets and mapped to Cozy Agent Office semantic animation keys.",
    },
  ],
});

console.log(
  `Generated ${Object.keys(characterFrames).length} clothed character frames and the ${OFFICE_WIDTH}x${OFFICE_HEIGHT} public office fallback.`,
);
