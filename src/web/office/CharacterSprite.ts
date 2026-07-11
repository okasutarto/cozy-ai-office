import { Container, AnimatedSprite, Graphics, Texture } from "pixi.js";
import type { ProfileId } from "../../shared/contracts.js";
import { STATIONS } from "./layout.js";
import { type CharacterAnimation, type ActorPose, stationRoutePoints } from "./animation.js";

export class CharacterSprite {
  public readonly container: Container;
  private animatedSprite: AnimatedSprite | null = null;
  private selectionGraphics: Graphics;
  private activeAnimation: CharacterAnimation = "idle";

  // Movement & animation states
  private targetStation: keyof typeof STATIONS;
  private currentPath: { x: number; y: number }[] = [];
  private pathIndex = 0;
  private currentX = 0;
  private currentY = 0;

  private lastPoseSequence = -1;
  private lastEffectSequence = -1;

  // One-shot effects
  private effectTimer = 0;
  private isCelebrating = false;
  private stableAnimationAfterCelebrate: CharacterAnimation = "idle";

  constructor(
    private readonly input: {
      actorId: ProfileId;
      textures: Record<CharacterAnimation, Texture[]>;
      onSelect(actorId: ProfileId): void;
      onMotionChanged(): void;
    },
  ) {
    this.container = new Container();
    this.container.interactive = true;
    this.container.on("pointertap", () => {
      this.input.onSelect(this.input.actorId);
    });

    this.selectionGraphics = new Graphics();
    this.container.addChild(this.selectionGraphics);

    // Initialize position to home station
    const targetKey = (
      this.input.actorId === "qa"
        ? "qa"
        : this.input.actorId === "advisor"
          ? "bookshelf"
          : `${this.input.actorId}-desk`
    ) as keyof typeof STATIONS;
    const home = STATIONS[targetKey] || STATIONS["meeting"];
    this.targetStation = targetKey;
    this.currentX = home.x;
    this.currentY = home.y;
    this.container.position.set(this.currentX, this.currentY);

    // Initial animation
    this.playAnimation("idle");
  }

  setSelected(selected: boolean): void {
    this.selectionGraphics.clear();
    if (selected) {
      this.selectionGraphics.stroke({ width: 1.5, color: 0xffe28a });
      this.selectionGraphics.rect(-8, -24, 16, 24);
    }
  }

  setPose(pose: ActorPose, options: { live: boolean; reduceMotion: boolean }): void {
    if (pose.sourceSequence <= this.lastPoseSequence && !pose.liveEffect) {
      return;
    }

    this.lastPoseSequence = pose.sourceSequence;

    const targetPos = STATIONS[pose.station];

    // Jumps or reduce motion
    if (!options.live || options.reduceMotion) {
      this.currentX = targetPos.x;
      this.currentY = targetPos.y;
      this.container.position.set(this.currentX, this.currentY);
      this.targetStation = pose.station;
      this.currentPath = [];
      this.pathIndex = 0;

      // Handle celebrate liveEffect under reduceMotion
      if (pose.liveEffect && pose.liveEffect.sourceSequence > this.lastEffectSequence) {
        this.lastEffectSequence = pose.liveEffect.sourceSequence;
        this.playAnimation("celebrate");
        this.isCelebrating = true;
        this.effectTimer = 0.25; // 250 ms first frame display
        this.stableAnimationAfterCelebrate = pose.animation;
      } else {
        this.playAnimation(pose.animation);
      }

      this.input.onMotionChanged();
      return;
    }

    // Live movement pathfinder setup
    if (pose.station !== this.targetStation) {
      const points = stationRoutePoints(this.targetStation, pose.station);
      this.targetStation = pose.station;
      this.currentPath = points;
      this.pathIndex = 0;
      this.input.onMotionChanged();
    }

    // Play celebrate effect if sequence matches
    if (pose.liveEffect && pose.liveEffect.sourceSequence > this.lastEffectSequence) {
      this.lastEffectSequence = pose.liveEffect.sourceSequence;
      this.stableAnimationAfterCelebrate = pose.animation;
      this.playAnimation("celebrate");
      this.isCelebrating = true;
      this.effectTimer = 1.0; // Play celebrate for 1 second
    } else if (!this.isCelebrating && this.currentPath.length === 0) {
      this.playAnimation(pose.animation);
    }
  }

  update(deltaSeconds: number): void {
    if (this.animatedSprite) {
      // Manual/simple frame advance loop if needed, or rely on Pixi's ticker
    }

    // Handle celebrate timer
    if (this.isCelebrating) {
      this.effectTimer -= deltaSeconds;
      if (this.effectTimer <= 0) {
        this.isCelebrating = false;
        this.playAnimation(this.stableAnimationAfterCelebrate);
        this.input.onMotionChanged();
      }
    }

    // Handle movement along waypoint path (32 pixels per second)
    if (this.currentPath.length > 0 && this.pathIndex < this.currentPath.length) {
      const target = this.currentPath[this.pathIndex]!;
      const dx = target.x - this.currentX;
      const dy = target.y - this.currentY;
      const dist = Math.hypot(dx, dy);

      const moveDist = 32 * deltaSeconds;

      if (dist <= moveDist) {
        this.currentX = target.x;
        this.currentY = target.y;
        this.pathIndex++;
        if (this.pathIndex >= this.currentPath.length) {
          this.currentPath = [];
          this.playAnimation(this.isCelebrating ? "celebrate" : "idle");
          this.input.onMotionChanged();
        }
      } else {
        const ratio = moveDist / dist;
        this.currentX += dx * ratio;
        this.currentY += dy * ratio;

        // Choose walk animation based on axis direction
        if (Math.abs(dx) > Math.abs(dy)) {
          this.playAnimation(dx > 0 ? "walk.right" : "walk.left");
        } else {
          this.playAnimation(dy > 0 ? "walk.down" : "walk.up");
        }
      }
      this.container.position.set(this.currentX, this.currentY);
    }
  }

  isSettled(): boolean {
    return this.currentPath.length === 0 && !this.isCelebrating;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private playAnimation(anim: CharacterAnimation): void {
    if (this.activeAnimation === anim && this.animatedSprite) return;

    this.activeAnimation = anim;
    if (this.animatedSprite) {
      this.container.removeChild(this.animatedSprite);
      this.animatedSprite.destroy();
    }

    const texs = this.input.textures[anim] || this.input.textures["idle"];
    if (texs && texs.length > 0) {
      this.animatedSprite = new AnimatedSprite(texs);
      this.animatedSprite.animationSpeed = 0.1;
      this.animatedSprite.anchor.set(0.5, 1);
      this.animatedSprite.play();
      this.container.addChild(this.animatedSprite);
    }
  }
}
