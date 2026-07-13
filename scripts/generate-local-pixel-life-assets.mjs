import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = process.env.PIXEL_LIFE_ASSETS_DIR
  ? path.resolve(process.env.PIXEL_LIFE_ASSETS_DIR)
  : path.join(root, ".local-assets", "pixel-life-source");
const outputRoot = path.join(root, ".local-assets", "pixel-life");
const individualRoot = path.join(sourceRoot, "individual");
const catalogRoot = path.join(outputRoot, "catalog");

const WIDTH = 768;
const HEIGHT = 288;
const ATLAS_WIDTH = 1024;
const ATLAS_HEIGHT = 1024;

function readAsset(relativePath) {
  const filePath = path.join(individualRoot, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`Missing Pixel Life asset: ${filePath}`);
  return PNG.sync.read(fs.readFileSync(filePath));
}

function fill(destination, color) {
  for (let offset = 0; offset < destination.data.length; offset += 4) {
    destination.data[offset] = color[0];
    destination.data[offset + 1] = color[1];
    destination.data[offset + 2] = color[2];
    destination.data[offset + 3] = color[3] ?? 255;
  }
}

function fillRect(destination, x, y, width, height, color) {
  for (
    let targetY = Math.max(0, y);
    targetY < Math.min(destination.height, y + height);
    targetY++
  ) {
    for (
      let targetX = Math.max(0, x);
      targetX < Math.min(destination.width, x + width);
      targetX++
    ) {
      const offset = (targetY * destination.width + targetX) * 4;
      destination.data[offset] = color[0];
      destination.data[offset + 1] = color[1];
      destination.data[offset + 2] = color[2];
      destination.data[offset + 3] = color[3] ?? 255;
    }
  }
}

function blit(source, destination, destinationX, destinationY) {
  for (let y = 0; y < source.height; y++) {
    const targetY = destinationY + y;
    if (targetY < 0 || targetY >= destination.height) continue;
    for (let x = 0; x < source.width; x++) {
      const targetX = destinationX + x;
      if (targetX < 0 || targetX >= destination.width) continue;
      const sourceOffset = (y * source.width + x) * 4;
      const alpha = source.data[sourceOffset + 3] / 255;
      if (alpha === 0) continue;
      const targetOffset = (targetY * destination.width + targetX) * 4;
      const inverseAlpha = 1 - alpha;
      for (let channel = 0; channel < 3; channel++) {
        destination.data[targetOffset + channel] = Math.round(
          source.data[sourceOffset + channel] * alpha +
            destination.data[targetOffset + channel] * inverseAlpha,
        );
      }
      destination.data[targetOffset + 3] = Math.round(
        source.data[sourceOffset + 3] + destination.data[targetOffset + 3] * inverseAlpha,
      );
    }
  }
}

function crop(source, sourceX, sourceY, width, height) {
  const result = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceOffset = ((sourceY + y) * source.width + sourceX + x) * 4;
      const targetOffset = (y * width + x) * 4;
      result.data.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return result;
}

function rotateQuarter(source, turns) {
  let current = source;
  for (let turn = 0; turn < ((turns % 4) + 4) % 4; turn++) {
    const rotated = new PNG({ width: current.height, height: current.width });
    for (let y = 0; y < current.height; y++) {
      for (let x = 0; x < current.width; x++) {
        const sourceOffset = (y * current.width + x) * 4;
        const targetX = current.height - 1 - y;
        const targetY = x;
        const targetOffset = (targetY * rotated.width + targetX) * 4;
        rotated.data.set(current.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
      }
    }
    current = rotated;
  }
  return current;
}

function tile(source, destination, startX, startY, width, height) {
  for (let y = startY; y < startY + height; y += source.height) {
    for (let x = startX; x < startX + width; x += source.width) {
      blit(source, destination, x, y);
    }
  }
}

const cache = new Map();
const asset = (relativePath) => {
  if (!cache.has(relativePath)) cache.set(relativePath, readAsset(relativePath));
  return cache.get(relativePath);
};

const sourceFiles = fs
  .readdirSync(individualRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
  .map((entry) => path.relative(individualRoot, path.join(entry.parentPath, entry.name)));
fs.mkdirSync(catalogRoot, { recursive: true });
const catalog = sourceFiles.map((source) => {
  const id = source
    .replace(/\.png$/iu, "")
    .replace(/[^a-z0-9]+/giu, "-")
    .toLowerCase();
  const file = `${id}.png`;
  const image = PNG.sync.read(fs.readFileSync(path.join(individualRoot, source)));
  fs.copyFileSync(path.join(individualRoot, source), path.join(catalogRoot, file));
  return {
    id,
    file,
    label: path.basename(source, ".png").replaceAll("_", " "),
    category: source.split(path.sep)[0],
    width: image.width,
    height: image.height,
    floor: source.startsWith(`Walls_floor_doors${path.sep}floor`),
  };
});
for (const stale of fs.readdirSync(catalogRoot)) {
  if (stale !== "manifest.json" && !catalog.some((asset) => asset.file === stale)) {
    fs.rmSync(path.join(catalogRoot, stale));
  }
}
fs.writeFileSync(path.join(catalogRoot, "manifest.json"), JSON.stringify(catalog, null, 2));

const scene = new PNG({ width: WIDTH, height: HEIGHT });
const foreground = new PNG({ width: WIDTH, height: HEIGHT });
fill(scene, [220, 228, 236, 255]);

const receptionFloor = asset("Walls_floor_doors/floor3.png");
const meetingFloor = asset("Walls_floor_doors/floor2.png");
const officeFloor = asset("Walls_floor_doors/floor6.png");
const breakFloor = asset("Walls_floor_doors/floor1.png");
const serverFloor = asset("Walls_floor_doors/floor5.png");
const wallTexture = asset("Walls_floor_doors/wall_plain_color.png");
const wallTop = crop(wallTexture, 0, 0, 32, 16);
const wallFront = crop(wallTexture, 0, 16, 32, 16);
const wallLeft = rotateQuarter(wallTop, 3);
const wallRight = rotateQuarter(wallTop, 1);
const doorHorizontal = crop(asset("Walls_floor_doors/door1.png"), 0, 16, 32, 16);
const doorVertical = rotateQuarter(doorHorizontal, 1);
const chair = asset("Seating/chair_under_gray.png");

tile(receptionFloor, scene, 0, 0, 128, HEIGHT);
tile(meetingFloor, scene, 128, 0, 208, 192);
tile(officeFloor, scene, 336, 0, 288, 192);
tile(officeFloor, scene, 128, 192, 352, 96);
tile(breakFloor, scene, 480, 192, 144, 96);
tile(serverFloor, scene, 624, 0, 144, HEIGHT);

const drawHorizontalWall = (target, x, y, width, front = false) =>
  tile(front ? wallFront : wallTop, target, x, y, width, 16);
const drawVerticalWall = (target, x, y, height, right = false) =>
  tile(right ? wallRight : wallLeft, target, x, y, 16, height);
const drawCorner = (target, x, y) => {
  fillRect(target, x, y, 16, 16, [48, 58, 75, 255]);
  fillRect(target, x + 4, y + 4, 8, 8, [101, 120, 139, 255]);
};
const drawGlass = (x, y, width, height) => {
  fillRect(scene, x, y, width, height, [43, 85, 112, 255]);
  fillRect(scene, x + 3, y + 3, width - 6, height - 6, [76, 156, 184, 190]);
  const vertical = height > width;
  for (
    let line = vertical ? y + 16 : x + 16;
    line < (vertical ? y + height : x + width);
    line += 32
  ) {
    if (vertical) fillRect(scene, x + 3, line, width - 6, 2, [165, 222, 228, 255]);
    else fillRect(scene, line, y + 3, 2, height - 6, [165, 222, 228, 255]);
  }
};

// Outer shell: every side is explicit and foreground walls occlude characters correctly.
drawHorizontalWall(scene, 0, 0, WIDTH);
drawHorizontalWall(foreground, 0, 272, WIDTH, true);
drawVerticalWall(scene, 0, 0, HEIGHT);
drawVerticalWall(foreground, 752, 0, HEIGHT, true);
for (const [x, y] of [
  [0, 0],
  [752, 0],
  [0, 272],
  [752, 272],
]) {
  drawCorner(foreground, x, y);
}

// Reception right wall with a corridor door at y=208..240.
drawVerticalWall(scene, 112, 16, 192, true);
drawVerticalWall(foreground, 112, 240, 32, true);
blit(doorVertical, foreground, 112, 208);

// Glass meeting room: right door and bottom door remain visibly open.
drawGlass(320, 16, 16, 80);
drawGlass(320, 128, 16, 64);
drawGlass(128, 176, 96, 16);
drawGlass(256, 176, 80, 16);
blit(doorVertical, scene, 320, 96);
blit(doorHorizontal, foreground, 224, 176);

// Workspace and break-room front walls with three corridor-facing doors.
drawHorizontalWall(foreground, 336, 176, 64, true);
drawHorizontalWall(foreground, 432, 176, 96, true);
drawHorizontalWall(foreground, 560, 176, 64, true);
blit(doorHorizontal, foreground, 400, 176);
blit(doorHorizontal, foreground, 528, 176);
drawVerticalWall(scene, 464, 192, 16, true);
drawVerticalWall(foreground, 464, 240, 32, true);
blit(doorVertical, foreground, 464, 208);

// Server room left wall and its open-office entrance.
drawVerticalWall(scene, 624, 16, 80, true);
drawVerticalWall(foreground, 624, 128, 144, true);
blit(doorVertical, scene, 624, 96);

const place = (relativePath, x, y, target = scene) => blit(asset(relativePath), target, x, y);

// Reception and waiting lounge.
place("Props_Large/bookcase_full.png", 16, 16);
place("Props_Large/desk_mahogany_left.png", 32, 80);
place("Props_Large/desk_mahogany_right.png", 64, 80);
place("Props_Small/Monitor2_F.png", 48, 64);
place("Props_Small/keyboard_mouse_black.png", 48, 88);
place("Seating/chair_gray_F.png", 24, 144);
place("Seating/chair_gray_F.png", 56, 144);
place("Props_Small/plant.png", 80, 16);
place("Props_Small/clock.png", 80, 176);
place("Props_Small/picture.png", 16, 208);

// Meeting room furniture.
place("Props_Large/bookcase_mahogany_full.png", 144, 16);
place("Props_Large/bookcase_mahogany_full.png", 288, 16);
place("update_1_1/whiteboard.png", 208, 16);
for (const x of [192, 224, 256]) {
  place("Seating/chair_red_F.png", x - 16, 24);
  place("Props_Large/desk_mahogany_small_back.png", x, 48);
  place("Props_Large/desk_mahogany_small_front.png", x, 72);
  place("Seating/chair_red_B.png", x - 16, 96);
}
place("Seating/chair_red_B.png", 272, 96);
place("Props_Small/messy_papers.png", 224, 56);
place("Props_Small/plant.png", 144, 144);
place("Props_Small/clock.png", 288, 144);

// Manager, advisor, QA, and four worker desks.
place("Props_Large/desk_mahogany_small_back.png", 368, 32);
place("Props_Small/Monitor2_F.png", 368, 24);
place("Props_Small/keyboard_mouse_black.png", 368, 40);
place("update_1_1/file_cabinet_gray.png", 416, 16);
place("Props_Large/bookcase_full.png", 464, 16);
place("Props_Large/desk_small_back.png", 480, 48);
place("Props_Small/books1.png", 480, 40);
place("Props_Large/desk_mahogany_small_back.png", 560, 32);
place("Props_Small/Monitor3_on_F.png", 552, 24);
place("update_1_1/cctv_monitor_multifeed.png", 576, 24);
place("Props_Small/keyboard_mouse_gray.png", 560, 40);

for (const [index, x] of [368, 432, 496, 560].entries()) {
  place("Props_Large/desk_small_back.png", x, 112);
  place(index % 2 === 0 ? "Props_Small/Monitor1_F.png" : "Props_Small/Monitor2_F.png", x, 104);
  place("Props_Small/keyboard_mouse_black.png", x, 120);
  place("Props_Small/pc_tower.png", x + 24, 128);
}

// Break room remains bottom-right of the central office.
place("Props_Large/desk_mahogany_left.png", 528, 240);
place("Props_Large/desk_mahogany_right.png", 560, 240);
place("update_1_1/coffee_machine.png", 592, 224);
place("Props_Small/Water_dispenser.png", 496, 208);
place("update_1_1/vending_machine_soda.png", 592, 240);
place("Props_Small/cup_green.png", 544, 232);
place("Props_Small/plant.png", 592, 256);

// Server and IT operations room.
place("update_1_1/server_rack_it.png", 656, 32);
place("update_1_1/server_rack_it.png", 688, 32);
place("update_1_1/file_cabinet_gray.png", 720, 32);
place("update_1_1/cctv_monitor_multifeed.png", 672, 112);
place("Props_Large/desk_small_back.png", 688, 160);
place("Props_Small/Monitor3_on_F.png", 688, 152);
place("Props_Small/keyboard_mouse_gray.png", 688, 168);
place("update_1_1/sign_id_card_required.png", 720, 96);
place("update_1_1/security_cam_front_on.png", 656, 224);
place("Props_Small/extinguisher.png", 720, 224);

const atlas = new PNG({ width: ATLAS_WIDTH, height: ATLAS_HEIGHT });
blit(scene, atlas, 0, 0);
blit(foreground, atlas, 0, 320);
blit(receptionFloor, atlas, 768, 0);
blit(serverFloor, atlas, 800, 0);
blit(officeFloor, atlas, 832, 0);
blit(wallTexture, atlas, 864, 0);
blit(chair, atlas, 896, 0);

const frame = (x, y, w, h, anchor = { x: 0, y: 0 }) => ({
  frame: { x, y, w, h },
  rotated: false,
  trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w, h },
  sourceSize: { w, h },
  anchor,
});

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, "office-atlas.png"), PNG.sync.write(atlas));
fs.writeFileSync(
  path.join(outputRoot, "office-atlas.json"),
  `${JSON.stringify(
    {
      frames: {
        "office.background": frame(0, 0, WIDTH, HEIGHT),
        "office.foreground": frame(0, 320, WIDTH, HEIGHT),
        "office.receptionFloor": frame(768, 0, 32, 32),
        "office.serverFloor": frame(800, 0, 32, 32),
        "office.floor": frame(832, 0, 32, 32),
        "office.wall": frame(864, 0, 32, 32),
        "office.wallBase": frame(864, 0, 32, 32),
        "office.chair": frame(896, 0, 32, 32, { x: 0.5, y: 1 }),
      },
      meta: {
        app: "cozy-agent-office-local-pixel-life-generator",
        version: "3",
        image: "office-atlas.png",
        format: "RGBA8888",
        size: { w: ATLAS_WIDTH, h: ATLAS_HEIGHT },
        scale: "1",
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ignored ${WIDTH}x${HEIGHT} fully-walled Pixel Life office in ${outputRoot}`);
