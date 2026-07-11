import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PNG } from "pngjs";

function getSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function hexToRgba(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
    a: parseInt(clean.substring(6, 8) || "FF", 16),
  };
}

// 1. Read recipes
const palettes = JSON.parse(fs.readFileSync("art/source/palettes.json", "utf8"));
const officeRecipe = JSON.parse(fs.readFileSync("art/source/office.json", "utf8"));
const charactersRecipe = JSON.parse(fs.readFileSync("art/source/characters.json", "utf8"));

const colors = {};
for (const [name, hex] of Object.entries(palettes.colors)) {
  colors[name] = hexToRgba(hex);
}

// Ensure output dirs exist
fs.mkdirSync("public/assets/office", { recursive: true });
fs.mkdirSync("public/assets/characters", { recursive: true });

// ==========================================
// Generate Office Atlas
// ==========================================
const officeWidth = 512;
const officeHeight = 512;
const officePng = new PNG({ width: officeWidth, height: officeHeight });

// Clear to transparent
for (let y = 0; y < officeHeight; y++) {
  for (let x = 0; x < officeWidth; x++) {
    const idx = (officeWidth * y + x) << 2;
    officePng.data[idx] = 0;
    officePng.data[idx + 1] = 0;
    officePng.data[idx + 2] = 0;
    officePng.data[idx + 3] = 0;
  }
}

// Helper to draw filled rect
function drawFillRect(png, rx, ry, rw, rh, color) {
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      if (x < 0 || x >= png.width || y < 0 || y >= png.height) continue;
      const idx = (png.width * y + x) << 2;
      png.data[idx] = color.r;
      png.data[idx + 1] = color.g;
      png.data[idx + 2] = color.b;
      png.data[idx + 3] = color.a;
    }
  }
}

// Helper to draw border
function drawRectBorder(png, rx, ry, rw, rh, color) {
  // Top & Bottom
  for (let x = rx; x < rx + rw; x++) {
    if (x >= 0 && x < png.width) {
      if (ry >= 0 && ry < png.height) {
        const idx1 = (png.width * ry + x) << 2;
        png.data[idx1] = color.r;
        png.data[idx1 + 1] = color.g;
        png.data[idx1 + 2] = color.b;
        png.data[idx1 + 3] = color.a;
      }
      if (ry + rh - 1 >= 0 && ry + rh - 1 < png.height) {
        const idx2 = (png.width * (ry + rh - 1) + x) << 2;
        png.data[idx2] = color.r;
        png.data[idx2 + 1] = color.g;
        png.data[idx2 + 2] = color.b;
        png.data[idx2 + 3] = color.a;
      }
    }
  }
  // Left & Right
  for (let y = ry; y < ry + rh; y++) {
    if (y >= 0 && y < png.height) {
      if (rx >= 0 && rx < png.width) {
        const idx1 = (png.width * y + rx) << 2;
        png.data[idx1] = color.r;
        png.data[idx1 + 1] = color.g;
        png.data[idx1 + 2] = color.b;
        png.data[idx1 + 3] = color.a;
      }
      if (rx + rw - 1 >= 0 && rx + rw - 1 < png.width) {
        const idx2 = (png.width * y + (rx + rw - 1)) << 2;
        png.data[idx2] = color.r;
        png.data[idx2 + 1] = color.g;
        png.data[idx2 + 2] = color.b;
        png.data[idx2 + 3] = color.a;
      }
    }
  }
}

// Draw the background (352x240) in office atlas at (0,0)
// First fill outline color as border/outer region
drawFillRect(officePng, 0, 0, 352, 240, colors["outline"]);

// Draw rooms floors and walls
for (const room of officeRecipe.rooms) {
  const floorCol = colors[room.floor] || colors["wood-mid"];
  const wallCol = colors[room.wall] || colors["wood-dark"];
  // Floor
  drawFillRect(officePng, room.x, room.y + 16, room.w, room.h - 16, floorCol);
  // Wall
  drawFillRect(officePng, room.x, room.y, room.w, 16, wallCol);
  // Wall bottom border outline
  drawRectBorder(officePng, room.x, room.y, room.w, 16, colors["outline"]);
  drawRectBorder(officePng, room.x, room.y + 16, room.w, room.h - 16, colors["outline"]);
}

// Draw static props on background
for (const prop of officeRecipe.props) {
  const spriteCol = colors["wood-dark"];
  drawFillRect(officePng, prop.x, prop.y, prop.w, prop.h, spriteCol);
  drawRectBorder(officePng, prop.x, prop.y, prop.w, prop.h, colors["outline"]);
}

// Draw separate state props (e.g. lamp, test tube, integrated state frames) in the remaining area
// For example, lamp at (360, 0) size 16x16, monitor at (360, 20) size 16x16
// State props prefixed with office.
const stateProps = [
  { name: "office.monitor.idle", x: 360, y: 0, w: 16, h: 16, color: "teal" },
  { name: "office.monitor.running", x: 360, y: 20, w: 16, h: 16, color: "gold" },
  { name: "office.monitor.error", x: 360, y: 40, w: 16, h: 16, color: "warning" },
  { name: "office.qa.lamp.pass", x: 380, y: 0, w: 8, h: 8, color: "moss" },
  { name: "office.qa.lamp.fail", x: 380, y: 10, w: 8, h: 8, color: "warning" },
  { name: "office.integration.spinner.0", x: 390, y: 0, w: 16, h: 16, color: "blue" },
  { name: "office.integration.spinner.1", x: 390, y: 20, w: 16, h: 16, color: "teal" },
];

for (const prop of stateProps) {
  drawFillRect(officePng, prop.x, prop.y, prop.w, prop.h, colors[prop.color]);
  drawRectBorder(officePng, prop.x, prop.y, prop.w, prop.h, colors["outline"]);
}

// Write office PNG
fs.writeFileSync("public/assets/office/office-atlas.png", PNG.sync.write(officePng));

// Build office JSON metadata
const officeFrames = {
  "office.background": {
    frame: { x: 0, y: 0, w: 352, h: 240 },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: 352, h: 240 },
    sourceSize: { w: 352, h: 240 },
    anchor: { x: 0, y: 0 },
  },
};

for (const prop of stateProps) {
  officeFrames[prop.name] = {
    frame: { x: prop.x, y: prop.y, w: prop.w, h: prop.h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: prop.w, h: prop.h },
    sourceSize: { w: prop.w, h: prop.h },
    anchor: { x: 0, y: 0 },
  };
}

const officeJson = {
  frames: officeFrames,
  meta: {
    app: "cozy-agent-office-generator",
    version: "1",
    image: "office-atlas.png",
    format: "RGBA8888",
    size: { w: officeWidth, h: officeHeight },
    scale: "1",
  },
};
fs.writeFileSync("public/assets/office/office-atlas.json", JSON.stringify(officeJson, null, 2));

// ==========================================
// Generate Characters Atlas
// ==========================================
const charWidth = 1024;
const charHeight = 256;
const charPng = new PNG({ width: charWidth, height: charHeight });

// Clear to transparent
for (let y = 0; y < charHeight; y++) {
  for (let x = 0; x < charWidth; x++) {
    const idx = (charWidth * y + x) << 2;
    charPng.data[idx] = 0;
    charPng.data[idx + 1] = 0;
    charPng.data[idx + 2] = 0;
    charPng.data[idx + 3] = 0;
  }
}

const characterFrames = {};
const charAnimations = {};

let globalFrameCount = 0;

charactersRecipe.actors.forEach((actor, actorIdx) => {
  const actorSkin = colors[actor.skin];
  const actorHair = colors[actor.hair];
  const actorShirt = colors[actor.shirt];
  const actorAccent = colors[actor.accent];

  Object.entries(charactersRecipe.animations).forEach(([animName, animFrameCount]) => {
    const animKey = `${actor.id}.${animName}`;
    charAnimations[animKey] = [];

    for (let fIdx = 0; fIdx < animFrameCount; fIdx++) {
      const frameName = `${actor.id}.${animName}.${fIdx}`;
      charAnimations[animKey].push(frameName);

      // Grid coordinate calculation (64 frames per row)
      const col = globalFrameCount % 64;
      const row = Math.floor(globalFrameCount / 64);
      const fx = col * 16;
      const fy = row * 24;

      characterFrames[frameName] = {
        frame: { x: fx, y: fy, w: 16, h: 24 },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: 16, h: 24 },
        sourceSize: { w: 16, h: 24 },
        anchor: { x: 0.5, y: 1 },
      };

      globalFrameCount++;

      // Make dynamic frame distinct by shifting leg/body drawing based on fIdx
      // Leg movement cycle
      const legOffset = (fIdx % 2) * 2;
      const headOffset = (fIdx % 3) * 1;
      const bodyOffset = (fIdx % 4) * 1;

      // Draw character body layers inside (fx, fy) -> (fx + 15, fy + 23)
      // Shadow (y=22..23)
      drawFillRect(charPng, fx + 3, fy + 22, 10, 2, colors["shadow"]);

      // Legs/Shoes (y=18..21)
      drawFillRect(charPng, fx + 4 + legOffset, fy + 18, 3, 4, colors["outline"]);
      drawFillRect(charPng, fx + 9 - legOffset, fy + 18, 3, 4, colors["outline"]);

      // Torso/Shirt/Accent (y=10..17)
      drawFillRect(charPng, fx + 3, fy + 10 + bodyOffset, 10, 8, actorShirt);
      drawFillRect(charPng, fx + 5, fy + 12 + bodyOffset, 6, 5, actorAccent);

      // Head/Skin (y=4..9)
      drawFillRect(charPng, fx + 4, fy + 4 + headOffset, 8, 6, actorSkin);

      // Hair (y=2..5)
      drawFillRect(charPng, fx + 3, fy + 2 + headOffset, 10, 3, actorHair);

      // Accessory representation
      if (actor.accessory === "ledger") {
        drawFillRect(charPng, fx + 11, fy + 12 + legOffset, 3, 4, colors["gold"]);
      } else if (actor.accessory === "headset") {
        drawFillRect(charPng, fx + 3, fy + 5 + headOffset, 2, 4, colors["gold"]);
        drawFillRect(charPng, fx + 11, fy + 5 + headOffset, 2, 4, colors["gold"]);
      } else if (actor.accessory === "mug") {
        drawFillRect(charPng, fx + 11, fy + 13 + headOffset, 3, 3, colors["teal"]);
      } else if (actor.accessory === "tool-pouch") {
        drawFillRect(charPng, fx + 3, fy + 15 + bodyOffset, 3, 3, colors["wood-dark"]);
      } else if (actor.accessory === "scarf") {
        drawFillRect(charPng, fx + 3, fy + 9 + bodyOffset, 10, 2, colors["blue"]);
      } else if (actor.accessory === "book") {
        drawFillRect(charPng, fx + 10, fy + 12 + legOffset, 4, 4, colors["rose"]);
      } else if (actor.accessory === "goggles") {
        drawFillRect(charPng, fx + 4, fy + 5 + headOffset, 8, 2, colors["warning"]);
      }

      // Dark outlines around character silhouette
      drawRectBorder(charPng, fx + 3, fy + 2 + headOffset, 10, 20, colors["outline"]);
    }
  });
});

// Write characters PNG
fs.writeFileSync("public/assets/characters/characters-atlas.png", PNG.sync.write(charPng));

// Build characters JSON
const charJson = {
  frames: characterFrames,
  animations: charAnimations,
  meta: {
    app: "cozy-agent-office-generator",
    version: "1",
    image: "characters-atlas.png",
    format: "RGBA8888",
    size: { w: charWidth, h: charHeight },
    scale: "1",
  },
};
fs.writeFileSync("public/assets/characters/characters-atlas.json", JSON.stringify(charJson, null, 2));

// ==========================================
// Generate asset-manifest.json
// ==========================================
const manifest = {
  version: 1,
  tileSize: 16,
  office: {
    width: 352,
    height: 240,
    image: "/assets/office/office-atlas.png",
    atlas: "/assets/office/office-atlas.json",
  },
  characters: {
    frameWidth: 16,
    frameHeight: 24,
    image: "/assets/characters/characters-atlas.png",
    atlas: "/assets/characters/characters-atlas.json",
    actors: ["manager", "worker-1", "worker-2", "worker-3", "worker-4", "advisor", "qa"],
  },
  scaleMode: "nearest",
};
fs.writeFileSync("public/assets/asset-manifest.json", JSON.stringify(manifest, null, 2));

// ==========================================
// Generate licenses.json
// ==========================================
const licenses = {
  version: 1,
  assets: [
    {
      id: "cozy-original-art",
      author: "Cozy Agent Office contributors",
      sourceUrl: "repository:art/source",
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      sourceFiles: [
        { "path": "art/source/palettes.json", "sha256": getSha256("art/source/palettes.json") },
        { "path": "art/source/office.json", "sha256": getSha256("art/source/office.json") },
        { "path": "art/source/characters.json", "sha256": getSha256("art/source/characters.json") },
      ],
      "outputs": [
        {
          "path": "public/assets/office/office-atlas.png",
          "sha256": getSha256("public/assets/office/office-atlas.png"),
          "frames": ["office.background"]
        },
        {
          "path": "public/assets/office/office-atlas.json",
          "sha256": getSha256("public/assets/office/office-atlas.json"),
          "frames": ["office.background"]
        },
        {
          "path": "public/assets/characters/characters-atlas.png",
          "sha256": getSha256("public/assets/characters/characters-atlas.png"),
          "frames": Object.keys(characterFrames)
        },
        {
          "path": "public/assets/characters/characters-atlas.json",
          "sha256": getSha256("public/assets/characters/characters-atlas.json"),
          "frames": Object.keys(characterFrames)
        }
      ],
      "modifications": "Deterministically generated original pixel art; no third-party pixels included"
    }
  ]
};
fs.writeFileSync("public/assets/licenses.json", JSON.stringify(licenses, null, 2));

console.log("Assets successfully generated!");
