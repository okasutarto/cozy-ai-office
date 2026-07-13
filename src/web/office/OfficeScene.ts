import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Spritesheet,
  Texture,
  TilingSprite,
} from "pixi.js";
import {
  calculateOfficeViewport,
  OFFICE_HEIGHT,
  OFFICE_WIDTH,
  TILE_SIZE,
  type OfficeViewport,
} from "./layout.js";
import { CharacterSprite } from "./CharacterSprite.js";
import { type CharacterAnimation, projectActorPoses } from "./animation.js";
import type { ProfileId, RunSnapshot, RunEvent } from "../../shared/contracts.js";
import type { OfficeLayout } from "../../shared/api.js";
import { catalogUrl, type CatalogAsset } from "./asset-catalog.js";

const ACTOR_IDS: ProfileId[] = [
  "manager",
  "worker-1",
  "worker-2",
  "worker-3",
  "worker-4",
  "advisor",
  "qa",
];

const ANIMATIONS: CharacterAnimation[] = [
  "idle.down",
  "idle.left",
  "idle.right",
  "idle.up",
  "walk.down",
  "walk.left",
  "walk.right",
  "walk.up",
  "work.up",
  "read.down",
  "talk.down",
  "test.up",
  "celebrate.down",
  "error.down",
];

const FLOOR_TILE_SIZE = 32;

export class OfficeScene {
  public app: Application;
  public worldContainer: Container;
  public backgroundSprite: Sprite | null = null;
  public foregroundSprite: Sprite | null = null;
  public disposed = false;
  public initialized = false;
  public onMotionState: ((state: "moving" | "settled") => void) | null = null;
  public onSelectActor: ((actorId: ProfileId) => void) | null = null;
  public onLayoutChange: ((layout: OfficeLayout) => void) | null = null;
  public onSelectFurniture: ((id: string | null) => void) | null = null;

  private readonly environmentContainer = new Container();
  private readonly perimeterContainer = new Container();
  private characters = new Map<ProfileId, CharacterSprite>();
  private maxHydratedSequence = 0;
  private currentMotionState: "moving" | "settled" = "settled";
  private officeSheet: Spritesheet | null = null;
  private readonly layoutContainer = new Container();
  private layout: OfficeLayout = { floors: {}, furniture: [] };
  private editTool: "off" | OfficeLayout["floors"][string] = "off";
  private readonly catalogTextures = new Map<string, Texture>();
  private readonly catalogTextureLoads = new Set<string>();
  private readonly catalog = new Map<string, CatalogAsset>();
  private viewport: OfficeViewport | null = null;
  private draggingId: string | null = null;
  private dragOffset = { x: 0, y: 0 };
  private painting = false;
  private selectedFurnitureId: string | null = null;

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.worldContainer.sortableChildren = true;
    this.layoutContainer.sortableChildren = true;
  }

  async init(wrapperElement: HTMLDivElement): Promise<void> {
    if (this.disposed) return;
    await this.app.init({
      width: OFFICE_WIDTH,
      height: OFFICE_HEIGHT,
      antialias: false,
      background: "#1f1b24",
      autoDensity: false,
      resolution: 1,
    });
    if (this.disposed) {
      this.app.destroy(true, { children: true });
      return;
    }

    this.app.canvas.style.display = "block";
    this.app.canvas.style.width = "100%";
    this.app.canvas.style.height = "100%";
    wrapperElement.appendChild(this.app.canvas);
    this.app.stage.addChild(this.environmentContainer);
    this.app.stage.addChild(this.perimeterContainer);
    this.worldContainer.addChild(this.layoutContainer);
    this.app.stage.addChild(this.worldContainer);

    wrapperElement.setAttribute("data-pixi-ready", "true");
    wrapperElement.setAttribute("data-pixi-antialias", "false");
    wrapperElement.setAttribute("data-pixi-scale-mode", "nearest");
    wrapperElement.setAttribute("data-pixi-scene-count", "1");
    this.app.canvas.addEventListener("pointerdown", this.handleLayoutPointerDown);
    this.app.canvas.addEventListener("pointermove", this.handleLayoutPointerMove);
    this.app.canvas.addEventListener("pointerup", this.handleLayoutPointerUp);
    this.app.canvas.addEventListener("pointerleave", this.handleLayoutPointerUp);
    this.initialized = true;
    let officeAtlas: unknown;
    try {
      officeAtlas = await Assets.load("/local-assets/pixel-life/office-atlas.json");
      wrapperElement.setAttribute("data-office-skin", "pixel-life-local");
    } catch {
      officeAtlas = await Assets.load("/assets/office/office-atlas.json");
      wrapperElement.setAttribute("data-office-skin", "public-fallback");
    }
    const characterAtlas = (await Assets.load(
      "/assets/characters/characters-atlas.json",
    )) as Spritesheet;
    if (this.disposed) return;

    const loadedOffice = officeAtlas as Partial<Spritesheet>;
    this.officeSheet = loadedOffice.textures ? (loadedOffice as Spritesheet) : null;
    if (this.officeSheet?.textureSource) this.officeSheet.textureSource.scaleMode = "nearest";
    if (characterAtlas.textureSource) characterAtlas.textureSource.scaleMode = "nearest";

    const chairTexture = this.officeSheet?.textures["office.chair"];
    const characterTextures = characterAtlas.textures ?? {};
    for (const actorId of ACTOR_IDS) {
      const textures = {} as Record<CharacterAnimation, Texture[]>;
      for (const animation of ANIMATIONS) {
        const frames: Texture[] = [];
        for (let index = 0; ; index++) {
          const texture = characterTextures[`${actorId}.${animation}.${index}`];
          if (!texture) break;
          frames.push(texture);
        }
        textures[animation] = frames;
      }
      const character = new CharacterSprite({
        actorId,
        textures,
        ...(chairTexture ? { chairTexture } : {}),
        onSelect: (id) => this.onSelectActor?.(id),
        onMotionChanged: () => this.checkMotionState(),
      });
      this.characters.set(actorId, character);
      this.worldContainer.addChild(character.container);
    }

    this.app.ticker.add((ticker) => {
      if (this.disposed) return;
      const deltaSeconds = ticker.deltaTime / 60;
      this.characters.forEach((character) => character.update(deltaSeconds));
    });
  }

  setState(input: {
    run: RunSnapshot | null;
    events: RunEvent[];
    selectedActorId: ProfileId;
    reduceMotion: boolean;
  }): void {
    if (this.disposed) return;
    const poses = projectActorPoses(input.run, input.events);
    const maxSequence = input.events.reduce(
      (maximum, event) => Math.max(maximum, event.sequence),
      0,
    );
    const live = this.maxHydratedSequence > 0 && maxSequence > this.maxHydratedSequence;
    this.maxHydratedSequence = Math.max(this.maxHydratedSequence, maxSequence);
    for (const pose of poses) {
      const character = this.characters.get(pose.actorId);
      if (!character) continue;
      character.setSelected(pose.actorId === input.selectedActorId);
      character.setPose(pose, { live, reduceMotion: input.reduceMotion });
    }
    this.checkMotionState();
  }

  resize(containerWidth: number, containerHeight: number): void {
    if (!this.initialized || this.disposed) return;
    const viewport = calculateOfficeViewport(containerWidth, containerHeight);
    this.viewport = viewport;
    this.app.renderer.resize(viewport.width, viewport.height);
    this.worldContainer.position.set(viewport.originX, viewport.originY);
    this.worldContainer.scale.set(viewport.zoom);
    this.rebuildEnvironment(viewport);
    const parent = this.app.canvas.parentElement;
    parent?.setAttribute("data-office-zoom", String(viewport.zoom));
    parent?.setAttribute("data-office-viewport", `${viewport.width}x${viewport.height}`);
    parent?.setAttribute("data-office-map", `${OFFICE_WIDTH}x${OFFICE_HEIGHT}`);
    parent?.setAttribute("data-office-perimeter", "true");
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.characters.forEach((character) => character.destroy());
    this.characters.clear();
    try {
      this.app.destroy(true, { children: true });
    } catch {}
  }

  setLayout(layout: OfficeLayout): void {
    this.layout = structuredClone(layout);
    if (
      this.selectedFurnitureId &&
      !this.layout.furniture.some((item) => item.id === this.selectedFurnitureId)
    ) {
      this.selectedFurnitureId = null;
      this.onSelectFurniture?.(null);
    }
    this.renderLayout();
  }

  setCatalog(assets: CatalogAsset[]): void {
    this.catalog.clear();
    assets.forEach((asset) => this.catalog.set(asset.id, asset));
    this.renderLayout();
  }

  getLayout(): OfficeLayout {
    return structuredClone(this.layout);
  }

  setEditTool(tool: typeof this.editTool): void {
    this.editTool = tool;
    this.app.canvas.style.cursor = tool === "off" ? "default" : "crosshair";
  }

  placeFurniture(
    kind: OfficeLayout["furniture"][number]["kind"],
    clientX: number,
    clientY: number,
  ): void {
    const asset = this.catalog.get(kind);
    const point = this.worldPoint({ clientX, clientY } as PointerEvent, {
      x: Math.floor((asset?.width ?? 32) / 2),
      y: Math.floor((asset?.height ?? 32) / 2),
    });
    if (!point) return;
    const id = crypto.randomUUID();
    const position = this.clampFurniturePoint(
      point,
      this.furnitureBounds({ id, kind, x: 0, y: 0 }),
    );
    this.layout.furniture.push({ id, kind, x: position.x, y: position.y });
    this.selectedFurnitureId = id;
    this.onSelectFurniture?.(id);
    this.commitLayout();
  }

  deleteFurniture(id: string): void {
    this.layout.furniture = this.layout.furniture.filter((item) => item.id !== id);
    if (this.selectedFurnitureId === id) {
      this.selectedFurnitureId = null;
      this.onSelectFurniture?.(null);
    }
    this.commitLayout();
  }

  private worldPoint(
    event: PointerEvent,
    offset: { x: number; y: number } = { x: 0, y: 0 },
    gridSize = 1,
  ): { x: number; y: number } | null {
    if (!this.viewport) return null;
    const bounds = this.app.canvas.getBoundingClientRect();
    const screenX = ((event.clientX - bounds.left) / bounds.width) * this.viewport.width;
    const screenY = ((event.clientY - bounds.top) / bounds.height) * this.viewport.height;
    const x =
      Math.floor(((screenX - this.viewport.originX) / this.viewport.zoom - offset.x) / gridSize) *
      gridSize;
    const y =
      Math.floor(((screenY - this.viewport.originY) / this.viewport.zoom - offset.y) / gridSize) *
      gridSize;
    return { x, y };
  }

  private floorPoint(event: PointerEvent): { x: number; y: number } | null {
    return this.worldPoint(event, undefined, FLOOR_TILE_SIZE);
  }

  private visibleWorldBounds(): { left: number; top: number; right: number; bottom: number } {
    if (!this.viewport) return { left: 0, top: 0, right: OFFICE_WIDTH, bottom: OFFICE_HEIGHT };
    return {
      left: Math.floor((0 - this.viewport.originX) / this.viewport.zoom / TILE_SIZE) * TILE_SIZE,
      top: Math.floor((0 - this.viewport.originY) / this.viewport.zoom / TILE_SIZE) * TILE_SIZE,
      right:
        Math.ceil((this.viewport.width - this.viewport.originX) / this.viewport.zoom / TILE_SIZE) *
        TILE_SIZE,
      bottom:
        Math.ceil((this.viewport.height - this.viewport.originY) / this.viewport.zoom / TILE_SIZE) *
        TILE_SIZE,
    };
  }

  private clampFurniturePoint(
    point: { x: number; y: number },
    size: { width: number; height: number } = { width: 32, height: 32 },
  ): { x: number; y: number } {
    const bounds = this.visibleWorldBounds();
    const maxX = Math.max(bounds.left, bounds.right - size.width);
    const maxY = Math.max(bounds.top, bounds.bottom - size.height);
    return {
      x: Math.min(Math.max(point.x, bounds.left), maxX),
      y: Math.min(Math.max(point.y, bounds.top), maxY),
    };
  }

  private furnitureBounds(item: OfficeLayout["furniture"][number]): {
    width: number;
    height: number;
  } {
    const asset = this.catalog.get(item.kind);
    return { width: asset?.width ?? 32, height: asset?.height ?? 32 };
  }

  private isTabletopAsset(kind: string): boolean {
    const asset = this.catalog.get(kind);
    return (
      asset?.category === "Props_Small" ||
      /monitor|keyboard|mouse|laptop/i.test(`${kind} ${asset?.label ?? ""}`)
    );
  }

  private furnitureZ(item: OfficeLayout["furniture"][number]): number {
    const { height } = this.furnitureBounds(item);
    return (this.isTabletopAsset(item.kind) ? 20_000 : 1_000) + item.y + height;
  }

  private handleLayoutPointerDown = (event: PointerEvent): void => {
    const point = this.worldPoint(event);
    if (!point) return;
    const hit = [...this.layout.furniture]
      .sort((a, b) => this.furnitureZ(b) - this.furnitureZ(a))
      .find((item) => {
        const { width, height } = this.furnitureBounds(item);
        return (
          point.x >= item.x &&
          point.x < item.x + width &&
          point.y >= item.y &&
          point.y < item.y + height
        );
      });
    if (hit) {
      event.preventDefault();
      event.stopPropagation();
      this.selectedFurnitureId = hit.id;
      this.onSelectFurniture?.(hit.id);
      this.renderLayout();
      this.draggingId = hit.id;
      this.dragOffset = { x: point.x - hit.x, y: point.y - hit.y };
      return;
    }
    if (this.editTool === "off") return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedFurnitureId = null;
    this.onSelectFurniture?.(null);
    if (this.editTool !== "off" && this.catalog.get(this.editTool)?.floor) {
      this.painting = true;
      const floorPoint = this.floorPoint(event);
      if (floorPoint) this.layout.floors[`${floorPoint.x}:${floorPoint.y}`] = this.editTool;
    }
    this.commitLayout();
  };

  private handleLayoutPointerMove = (event: PointerEvent): void => {
    if (this.painting) {
      const point = this.floorPoint(event);
      if (point && this.editTool !== "off" && this.catalog.get(this.editTool)?.floor) {
        this.layout.floors[`${point.x}:${point.y}`] = this
          .editTool as OfficeLayout["floors"][string];
        this.renderLayout();
      }
      return;
    }
    if (!this.draggingId) return;
    const point = this.worldPoint(event);
    const item = this.layout.furniture.find((candidate) => candidate.id === this.draggingId);
    if (!point || !item) return;
    const position = this.clampFurniturePoint(
      {
        x: point.x - this.dragOffset.x,
        y: point.y - this.dragOffset.y,
      },
      this.furnitureBounds(item),
    );
    item.x = position.x;
    item.y = position.y;
    this.renderLayout();
  };

  private handleLayoutPointerUp = (): void => {
    if (this.painting) {
      this.painting = false;
      this.commitLayout();
      return;
    }
    if (!this.draggingId) return;
    this.draggingId = null;
    this.commitLayout();
  };

  private commitLayout(): void {
    this.renderLayout();
    this.onLayoutChange?.(structuredClone(this.layout));
  }

  private renderLayout(): void {
    const removed = this.layoutContainer.removeChildren();
    removed.forEach((child) => child.destroy());
    for (const [key, kind] of Object.entries(this.layout.floors)) {
      const [x = 0, y = 0] = key.split(":").map(Number);
      const texture = this.catalogTextures.get(kind);
      if (!texture) {
        void this.loadCatalogTexture(kind);
        continue;
      }
      const sprite = new Sprite(texture);
      sprite.position.set(x, y);
      sprite.width = FLOOR_TILE_SIZE;
      sprite.height = FLOOR_TILE_SIZE;
      this.layoutContainer.addChild(sprite);
    }
    for (const item of [...this.layout.furniture].sort(
      (a, b) => this.furnitureZ(a) - this.furnitureZ(b),
    )) {
      const texture = this.catalogTextures.get(item.kind);
      if (!texture) {
        void this.loadCatalogTexture(item.kind);
        continue;
      }
      const sprite = new Sprite(texture);
      sprite.position.set(item.x, item.y);
      sprite.zIndex = this.furnitureZ(item);
      this.layoutContainer.addChild(sprite);
      if (item.id === this.selectedFurnitureId) {
        const outline = new Graphics()
          .rect(item.x - 2, item.y - 2, sprite.width + 4, sprite.height + 4)
          .stroke({ color: 0xffcc55, width: 2 });
        outline.zIndex = sprite.zIndex + 1;
        this.layoutContainer.addChild(outline);
        const remove = new Graphics()
          .circle(item.x + sprite.width, item.y, 7)
          .fill(0xb93838)
          .moveTo(item.x + sprite.width - 3, item.y - 3)
          .lineTo(item.x + sprite.width + 3, item.y + 3)
          .moveTo(item.x + sprite.width + 3, item.y - 3)
          .lineTo(item.x + sprite.width - 3, item.y + 3)
          .stroke({ color: 0xffffff, width: 2 });
        remove.zIndex = outline.zIndex + 1;
        remove.eventMode = "static";
        remove.cursor = "pointer";
        remove.on("pointerdown", (event) => {
          event.stopPropagation();
          this.deleteFurniture(item.id);
        });
        this.layoutContainer.addChild(remove);
      }
    }
    this.layoutContainer.zIndex = 5;
  }

  private async loadCatalogTexture(id: string): Promise<void> {
    const asset = this.catalog.get(id);
    if (!asset || this.catalogTextures.has(id) || this.catalogTextureLoads.has(id)) return;
    this.catalogTextureLoads.add(id);
    try {
      const texture = (await Assets.load(catalogUrl(asset.file))) as Texture;
      texture.source.scaleMode = "nearest";
      this.catalogTextures.set(id, texture);
      if (!this.disposed) this.renderLayout();
    } finally {
      this.catalogTextureLoads.delete(id);
    }
  }

  private rebuildEnvironment(viewport: OfficeViewport): void {
    const removed = this.environmentContainer.removeChildren();
    removed.forEach((child) => child.destroy());
    const removedPerimeter = this.perimeterContainer.removeChildren();
    removedPerimeter.forEach((child) => child.destroy());
    if (!this.officeSheet) return;

    const floorTexture = this.officeSheet.textures["office.floor"];
    const wallTexture = this.officeSheet.textures["office.wall"];
    if (!floorTexture || !wallTexture) {
      const fallback = new Graphics();
      fallback.rect(0, 0, viewport.width, viewport.height).fill(0x202838);
      this.environmentContainer.addChild(fallback);
      return;
    }
    const receptionFloorTexture =
      this.officeSheet.textures["office.receptionFloor"] ?? floorTexture;
    const serverFloorTexture = this.officeSheet.textures["office.serverFloor"] ?? floorTexture;

    const addRegion = (
      container: Container,
      texture: Texture,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      if (width <= 0 || height <= 0) return;
      const region = new TilingSprite({
        texture,
        width,
        height,
        tileScale: { x: viewport.zoom, y: viewport.zoom },
      });
      region.position.set(x, y);
      container.addChild(region);
    };

    addRegion(this.environmentContainer, floorTexture, 0, 0, viewport.width, viewport.height);
    addRegion(
      this.environmentContainer,
      receptionFloorTexture,
      0,
      0,
      Math.max(0, viewport.originX),
      viewport.height,
    );
    const worldRight = viewport.originX + OFFICE_WIDTH * viewport.zoom;
    addRegion(
      this.environmentContainer,
      serverFloorTexture,
      worldRight,
      0,
      Math.max(0, viewport.width - worldRight),
      viewport.height,
    );

    const wallThickness = Math.max(8, Math.round(8 * viewport.zoom));
    addRegion(this.perimeterContainer, wallTexture, 0, 0, viewport.width, wallThickness);
    addRegion(
      this.perimeterContainer,
      wallTexture,
      0,
      viewport.height - wallThickness,
      viewport.width,
      wallThickness,
    );
    addRegion(this.perimeterContainer, wallTexture, 0, 0, wallThickness, viewport.height);
    addRegion(
      this.perimeterContainer,
      wallTexture,
      viewport.width - wallThickness,
      0,
      wallThickness,
      viewport.height,
    );
  }

  private checkMotionState(): void {
    let allSettled = true;
    this.characters.forEach((character) => {
      if (!character.isSettled()) allSettled = false;
    });
    const nextState = allSettled ? "settled" : "moving";
    if (nextState !== this.currentMotionState) {
      this.currentMotionState = nextState;
      this.onMotionState?.(nextState);
    }
  }
}
