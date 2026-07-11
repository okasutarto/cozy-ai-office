import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function getSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getTextSha256(filePath) {
  const content = fs.readFileSync(filePath, "utf8").replaceAll("\r\n", "\n");
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

function validatePngHeader(filePath, expectedW, expectedH) {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(24);
  fs.readSync(fd, buffer, 0, 24, 0);
  fs.closeSync(fd);

  // Check PNG signature
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a
  ) {
    throw new Error(`Invalid PNG signature for ${filePath}`);
  }

  // Width is at offset 16
  const width = buffer.readInt32BE(16);
  // Height is at offset 20
  const height = buffer.readInt32BE(20);

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid PNG dimensions for ${filePath}: ${width}x${height}`);
  }

  if (width !== expectedW || height !== expectedH) {
    throw new Error(
      `PNG dimensions mismatch for ${filePath}. Expected ${expectedW}x${expectedH}, got ${width}x${height}`,
    );
  }

  if (!isPowerOfTwo(width) || !isPowerOfTwo(height)) {
    throw new Error(`PNG dimensions must be power of two: got ${width}x${height}`);
  }

  if (width > 2048 || height > 2048) {
    throw new Error(`PNG dimensions exceed 2048 limit: got ${width}x${height}`);
  }
}

function validateAtlasJson(filePath, expectedImageName, expectedW, expectedH, expectedAnchor) {
  const content = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(content);

  // Check meta
  const meta = data.meta;
  if (!meta) throw new Error(`Missing meta block in ${filePath}`);
  if (meta.app !== "cozy-agent-office-generator")
    throw new Error(`Invalid meta.app in ${filePath}`);
  if (meta.version !== "1") throw new Error(`Invalid meta.version in ${filePath}`);
  if (meta.image !== expectedImageName) throw new Error(`Invalid meta.image in ${filePath}`);
  if (meta.format !== "RGBA8888") throw new Error(`Invalid meta.format in ${filePath}`);
  if (meta.size.w !== expectedW || meta.size.h !== expectedH) {
    throw new Error(`Invalid meta.size in ${filePath}: ${meta.size.w}x${meta.size.h}`);
  }

  // Check frames
  if (!data.frames || typeof data.frames !== "object") {
    throw new Error(`Missing frames in ${filePath}`);
  }

  for (const [key, frameData] of Object.entries(data.frames)) {
    const f = frameData.frame;
    if (
      !f ||
      typeof f.x !== "number" ||
      typeof f.y !== "number" ||
      typeof f.w !== "number" ||
      typeof f.h !== "number"
    ) {
      throw new Error(`Invalid frame shape for key ${key} in ${filePath}`);
    }
    if (f.x < 0 || f.y < 0 || f.x + f.w > expectedW || f.y + f.h > expectedH) {
      throw new Error(`Frame ${key} boundaries exceed atlas size in ${filePath}`);
    }
    if (frameData.rotated !== false) throw new Error(`Frame ${key} cannot be rotated`);
    if (frameData.trimmed !== false) throw new Error(`Frame ${key} cannot be trimmed`);

    const sss = frameData.spriteSourceSize;
    if (!sss || sss.x !== 0 || sss.y !== 0 || sss.w !== f.w || sss.h !== f.h) {
      throw new Error(`Invalid spriteSourceSize for ${key} in ${filePath}`);
    }

    const ss = frameData.sourceSize;
    if (!ss || ss.w !== f.w || ss.h !== f.h) {
      throw new Error(`Invalid sourceSize for ${key} in ${filePath}`);
    }

    const anchor = frameData.anchor;
    if (!anchor || anchor.x !== expectedAnchor.x || anchor.y !== expectedAnchor.y) {
      throw new Error(
        `Invalid anchor for ${key} in ${filePath}. Expected ${JSON.stringify(expectedAnchor)}, got ${JSON.stringify(anchor)}`,
      );
    }
  }

  return data;
}

try {
  console.log("Validating generated assets...");

  // 1. Validate PNG headers & dimensions
  validatePngHeader("public/assets/office/office-atlas.png", 512, 512);
  validatePngHeader("public/assets/characters/characters-atlas.png", 1024, 256);

  // 2. Validate Atlases JSON structure
  validateAtlasJson("public/assets/office/office-atlas.json", "office-atlas.png", 512, 512, {
    x: 0,
    y: 0,
  });
  const charsData = validateAtlasJson(
    "public/assets/characters/characters-atlas.json",
    "characters-atlas.png",
    1024,
    256,
    { x: 0.5, y: 1 },
  );

  // 3. Verify exactly 336 character frames exist
  const actors = ["manager", "worker-1", "worker-2", "worker-3", "worker-4", "advisor", "qa"];
  const anims = {
    idle: 4,
    "walk.down": 4,
    "walk.left": 4,
    "walk.right": 4,
    "walk.up": 4,
    work: 6,
    read: 4,
    talk: 4,
    test: 6,
    celebrate: 6,
    error: 2,
  };

  const expectedFrameKeys = [];
  actors.forEach((actor) => {
    Object.entries(anims).forEach(([animName, frameCount]) => {
      for (let i = 0; i < frameCount; i++) {
        expectedFrameKeys.push(`${actor}.${animName}.${i}`);
      }
    });
  });

  if (expectedFrameKeys.length !== 336) {
    throw new Error(
      `Internal error: Expected frame keys length should be 336, got ${expectedFrameKeys.length}`,
    );
  }

  const actualFrameKeys = Object.keys(charsData.frames);
  if (actualFrameKeys.length !== 336) {
    throw new Error(
      `Expected exactly 336 frames in characters-atlas.json, got ${actualFrameKeys.length}`,
    );
  }

  expectedFrameKeys.forEach((key) => {
    if (!charsData.frames[key]) {
      throw new Error(`Missing expected character frame key: ${key}`);
    }
  });

  // Verify animations field in characters-atlas.json
  const animations = charsData.animations;
  if (!animations || typeof animations !== "object") {
    throw new Error("Missing animations mapping in characters-atlas.json");
  }

  actors.forEach((actor) => {
    Object.keys(anims).forEach((animName) => {
      const animKey = `${actor}.${animName}`;
      const list = animations[animKey];
      if (!Array.isArray(list)) {
        throw new Error(`Missing animation mapping for ${animKey}`);
      }
      if (list.length !== anims[animName]) {
        throw new Error(
          `Invalid frame count for animation ${animKey}: expected ${anims[animName]}, got ${list.length}`,
        );
      }
    });
  });

  // 4. Validate asset-manifest.json and licenses.json
  const manifest = JSON.parse(fs.readFileSync("public/assets/asset-manifest.json", "utf8"));
  if (manifest.version !== 1) throw new Error("Invalid version in asset-manifest.json");
  if (manifest.tileSize !== 16) throw new Error("Invalid tileSize in asset-manifest.json");

  const licenses = JSON.parse(fs.readFileSync("public/assets/licenses.json", "utf8"));
  if (licenses.version !== 1) throw new Error("Invalid version in licenses.json");
  if (!Array.isArray(licenses.assets) || licenses.assets.length === 0) {
    throw new Error("licenses.json assets must be a non-empty array");
  }

  const expectedAssets = {
    "pixel-office-2dpig": "https://2dpig.itch.io/pixel-office",
    "metrocity-characters-jik-a-4": "https://jik-a-4.itch.io/metrocity-free-topdown-character-pack",
  };
  if (licenses.assets.length !== Object.keys(expectedAssets).length) {
    throw new Error(`Expected ${Object.keys(expectedAssets).length} licensed assets`);
  }

  // Validate hashes inside licenses.json
  for (const asset of licenses.assets) {
    if (!expectedAssets[asset.id])
      throw new Error(`Invalid asset ID in licenses.json: ${asset.id}`);
    if (asset.license !== "CC0-1.0") throw new Error(`Invalid license for ${asset.id}`);
    if (asset.sourceUrl !== expectedAssets[asset.id]) {
      throw new Error(`Invalid source URL for ${asset.id}`);
    }

    asset.sourceFiles.forEach((file) => {
      if (!fs.existsSync(file.path)) throw new Error(`Missing licensed source file: ${file.path}`);
      const calculated = file.path.endsWith(".txt")
        ? getTextSha256(file.path)
        : getSha256(file.path);
      if (file.sha256 !== calculated) {
        throw new Error(
          `Hash mismatch for source file ${file.path}: expected ${file.sha256}, got ${calculated}`,
        );
      }
    });

    asset.outputs.forEach((file) => {
      const calculated = getSha256(file.path);
      if (file.sha256 !== calculated) {
        throw new Error(
          `Hash mismatch for output file ${file.path}: expected ${file.sha256}, got ${calculated}`,
        );
      }
    });
  }

  // Print compact SHA-256 table
  console.log("\nAsset Hashing Verification Table:");
  console.log("------------------------------------------------------------------");
  licenses.assets.forEach((asset) =>
    asset.outputs.forEach((file) => {
      console.log(`${file.path.padEnd(50)} [${file.sha256.substring(0, 10)}...]`);
    }),
  );
  console.log("------------------------------------------------------------------");

  console.log("\nAssets validation passed successfully!");
  process.exit(0);
} catch (err) {
  console.error("Asset validation failed:", err.message || err);
  process.exit(1);
}
