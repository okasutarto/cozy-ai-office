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
  type OfficeViewport,
} from "./layout.js";
import { CharacterSprite } from "./CharacterSprite.js";
import { type CharacterAnimation, projectActorPoses } from "./animation.js";
import type { ProfileId, RunSnapshot, RunEvent } from "../../shared/contracts.js";

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

export class OfficeScene {
  public app: Application;
  public worldContainer: Container;
  public backgroundSprite: Sprite | null = null;
  public foregroundSprite: Sprite | null = null;
  public disposed = false;
  public initialized = false;
  public onMotionState: ((state: "moving" | "settled") => void) | null = null;
  public onSelectActor: ((actorId: ProfileId) => void) | null = null;

  private readonly environmentContainer = new Container();
  private readonly perimeterContainer = new Container();
  private characters = new Map<ProfileId, CharacterSprite>();
  private maxHydratedSequence = 0;
  private currentMotionState: "moving" | "settled" = "settled";
  private officeSheet: Spritesheet | null = null;

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.worldContainer.sortableChildren = true;
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
    this.app.stage.addChild(this.worldContainer);
    this.app.stage.addChild(this.perimeterContainer);

    wrapperElement.setAttribute("data-pixi-ready", "true");
    wrapperElement.setAttribute("data-pixi-antialias", "false");
    wrapperElement.setAttribute("data-pixi-scale-mode", "nearest");
    wrapperElement.setAttribute("data-pixi-scene-count", "1");

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

    this.officeSheet = officeAtlas as Spritesheet;
    this.officeSheet.textureSource.scaleMode = "nearest";
    characterAtlas.textureSource.scaleMode = "nearest";

    const backgroundTexture = this.officeSheet.textures["office.background"];
    if (backgroundTexture) {
      this.backgroundSprite = new Sprite(backgroundTexture);
      this.backgroundSprite.zIndex = -1;
      this.worldContainer.addChild(this.backgroundSprite);
    }

    const foregroundTexture = this.officeSheet.textures["office.foreground"];
    if (foregroundTexture) {
      this.foregroundSprite = new Sprite(foregroundTexture);
      this.foregroundSprite.zIndex = 10_000;
      this.worldContainer.addChild(this.foregroundSprite);
    }

    const chairTexture = this.officeSheet.textures["office.chair"];
    for (const actorId of ACTOR_IDS) {
      const textures = {} as Record<CharacterAnimation, Texture[]>;
      for (const animation of ANIMATIONS) {
        const frames: Texture[] = [];
        for (let index = 0; ; index++) {
          const texture = characterAtlas.textures[`${actorId}.${animation}.${index}`];
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
    this.initialized = true;
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
