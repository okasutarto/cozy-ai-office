import { Application, Container, Sprite, Assets, Spritesheet, Texture } from "pixi.js";
import { OFFICE_WIDTH, OFFICE_HEIGHT } from "./layout.js";
import { CharacterSprite } from "./CharacterSprite.js";
import { type ActorPose, type CharacterAnimation, projectActorPoses } from "./animation.js";
import type { ProfileId, RunSnapshot, RunEvent } from "../../shared/contracts.js";

export class OfficeScene {
  public app: Application;
  public worldContainer: Container;
  public backgroundSprite: Sprite | null = null;
  public disposed = false;
  public initialized = false;

  // Characters registry
  private characters: Map<ProfileId, CharacterSprite> = new Map();
  private maxHydratedSequence = 0;
  private currentMotionState: "moving" | "settled" = "settled";

  public onMotionState: ((state: "moving" | "settled") => void) | null = null;
  public onSelectActor: ((actorId: ProfileId) => void) | null = null;

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
  }

  async init(wrapperEl: HTMLDivElement): Promise<void> {
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

    wrapperEl.appendChild(this.app.canvas);
    this.app.stage.addChild(this.worldContainer);

    // Set diagnostics attributes
    wrapperEl.setAttribute("data-pixi-ready", "true");
    wrapperEl.setAttribute("data-pixi-antialias", "false");
    wrapperEl.setAttribute("data-pixi-scale-mode", "nearest");
    wrapperEl.setAttribute("data-pixi-scene-count", "1");

    // Load assets
    const officeAtlas = await Assets.load("/assets/office/office-atlas.json");
    const charAtlas = await Assets.load("/assets/characters/characters-atlas.json");

    if (this.disposed) return;

    // Set nearest scale mode on textures
    if (officeAtlas && officeAtlas.textureSource) {
      officeAtlas.textureSource.scaleMode = "nearest";
    }
    if (charAtlas && charAtlas.textureSource) {
      charAtlas.textureSource.scaleMode = "nearest";
    }

    // Load spritesheets resources explicitly
    const officeSheet = officeAtlas as Spritesheet;
    if (officeSheet.textures["office.background"]) {
      this.backgroundSprite = new Sprite(officeSheet.textures["office.background"]);
      this.worldContainer.addChild(this.backgroundSprite);
    }

    // Initialize character sprites
    const charSheet = charAtlas as Spritesheet;
    const actorIds: ProfileId[] = [
      "manager",
      "worker-1",
      "worker-2",
      "worker-3",
      "worker-4",
      "advisor",
      "qa",
    ];
    const anims: CharacterAnimation[] = [
      "idle",
      "walk.down",
      "walk.left",
      "walk.right",
      "walk.up",
      "work",
      "read",
      "talk",
      "test",
      "celebrate",
      "error",
    ];

    actorIds.forEach((actorId) => {
      const textures: Record<CharacterAnimation, Texture[]> = {} as any;
      anims.forEach((anim) => {
        const frames: Texture[] = [];
        let idx = 0;
        while (true) {
          const key = `${actorId}.${anim}.${idx}`;
          const tex = charSheet.textures[key];
          if (!tex) break;
          frames.push(tex);
          idx++;
        }
        textures[anim] = frames;
      });

      const charSprite = new CharacterSprite({
        actorId,
        textures,
        onSelect: (id) => this.onSelectActor?.(id),
        onMotionChanged: () => this.checkMotionState(),
      });

      this.characters.set(actorId, charSprite);
      this.worldContainer.addChild(charSprite.container);
    });

    // Start ticker loop
    this.app.ticker.add((ticker) => {
      if (this.disposed) return;
      const deltaSeconds = ticker.deltaTime / 60;
      this.characters.forEach((char) => char.update(deltaSeconds));
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

    // Get projected poses
    const poses = projectActorPoses(input.run, input.events);

    // Determine if we should perform live animation or recovery
    const maxSeq = input.events.reduce((acc, e) => Math.max(acc, e.sequence), 0);
    const live = this.maxHydratedSequence > 0 && maxSeq > this.maxHydratedSequence;

    if (maxSeq > this.maxHydratedSequence) {
      this.maxHydratedSequence = maxSeq;
    }

    poses.forEach((pose) => {
      const char = this.characters.get(pose.actorId);
      if (char) {
        char.setSelected(pose.actorId === input.selectedActorId);
        char.setPose(pose, { live, reduceMotion: input.reduceMotion });
      }
    });

    this.checkMotionState();
  }

  resize(containerWidth: number, containerHeight: number): void {
    if (!this.initialized || this.disposed || !this.app.canvas) return;

    const scale = Math.max(
      1,
      Math.floor(Math.min(containerWidth / OFFICE_WIDTH, containerHeight / OFFICE_HEIGHT)),
    );

    this.app.canvas.style.width = `${OFFICE_WIDTH * scale}px`;
    this.app.canvas.style.height = `${OFFICE_HEIGHT * scale}px`;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.characters.forEach((char) => char.destroy());
    this.characters.clear();
    try {
      this.app.destroy(true, { children: true });
    } catch {}
  }

  private checkMotionState(): void {
    let allSettled = true;
    this.characters.forEach((char) => {
      if (!char.isSettled()) allSettled = false;
    });

    const nextState = allSettled ? "settled" : "moving";
    if (nextState !== this.currentMotionState) {
      this.currentMotionState = nextState;
      this.onMotionState?.(nextState);
    }
  }
}
