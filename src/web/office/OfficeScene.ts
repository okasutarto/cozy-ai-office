import { Application, Container, Sprite, Assets, Spritesheet } from "pixi.js";
import { OFFICE_WIDTH, OFFICE_HEIGHT } from "./layout.js";

export class OfficeScene {
  public app: Application;
  public worldContainer: Container;
  public backgroundSprite: Sprite | null = null;
  public disposed = false;
  private resizeCallback: (() => void) | null = null;

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
  }

  resize(containerWidth: number, containerHeight: number): void {
    if (this.disposed || !this.app.canvas) return;

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
    try {
      this.app.destroy(true, { children: true });
    } catch {}
  }
}
