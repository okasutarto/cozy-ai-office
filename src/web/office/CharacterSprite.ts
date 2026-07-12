import { Container, AnimatedSprite, Graphics, Sprite, Texture } from "pixi.js";
import type { ProfileId } from "../../shared/contracts.js";
import { MEETING_SLOTS, type StationName } from "./layout.js";
import { type CharacterAnimation, type ActorPose, stationRoutePoints } from "./animation.js";

export class CharacterSprite {
  public readonly container: Container;
  private animatedSprite: AnimatedSprite | null = null;
  private readonly selectionGraphics: Graphics;
  private readonly seatingMask: Graphics;
  private readonly chairSprite: Sprite | null;
  private activeAnimation: CharacterAnimation | null = null;
  private stableAnimation: CharacterAnimation = "idle.down";
  private desiredSeated = false;
  private seated = false;

  private targetStation: StationName = "meeting";
  private currentPath: { x: number; y: number }[] = [];
  private pathIndex = 0;
  private currentX = 0;
  private currentY = 0;
  private lastPoseSequence = -1;
  private lastEffectSequence = -1;
  private effectTimer = 0;
  private isCelebrating = false;

  constructor(
    private readonly input: {
      actorId: ProfileId;
      textures: Record<CharacterAnimation, Texture[]>;
      chairTexture?: Texture;
      onSelect(actorId: ProfileId): void;
      onMotionChanged(): void;
    },
  ) {
    this.container = new Container();
    this.container.eventMode = "static";
    this.container.cursor = "pointer";
    this.container.on("pointertap", () => this.input.onSelect(this.input.actorId));

    this.selectionGraphics = new Graphics();
    this.container.addChild(this.selectionGraphics);

    this.chairSprite = input.chairTexture ? new Sprite(input.chairTexture) : null;
    if (this.chairSprite) {
      this.chairSprite.anchor.set(0.5, 1);
      this.chairSprite.visible = false;
      this.container.addChild(this.chairSprite);
    }

    this.seatingMask = new Graphics();
    this.seatingMask.rect(-16, -32, 32, 24).fill(0xffffff);
    this.seatingMask.visible = false;
    this.container.addChild(this.seatingMask);

    const meeting = MEETING_SLOTS[this.input.actorId];
    this.currentX = meeting.x;
    this.currentY = meeting.y;
    this.container.position.set(this.currentX, this.currentY);
    this.container.zIndex = this.currentY;
    this.playAnimation(`idle.${meeting.facing}`);
  }

  setSelected(selected: boolean): void {
    this.selectionGraphics.clear();
    if (selected) {
      this.selectionGraphics.rect(-16, -32, 32, 32).stroke({ width: 1.5, color: 0xffe28a });
    }
  }

  setPose(pose: ActorPose, options: { live: boolean; reduceMotion: boolean }): void {
    if (pose.sourceSequence < this.lastPoseSequence && !pose.liveEffect) return;
    this.lastPoseSequence = pose.sourceSequence;
    this.stableAnimation = pose.animation;
    this.desiredSeated = pose.seated;

    if (!options.live || options.reduceMotion) {
      this.finishAtPose(pose);
      if (pose.liveEffect && pose.liveEffect.sourceSequence > this.lastEffectSequence) {
        this.lastEffectSequence = pose.liveEffect.sourceSequence;
        this.beginCelebration(pose.animation, 0.25);
      }
      this.input.onMotionChanged();
      return;
    }

    const changedTarget =
      pose.station !== this.targetStation ||
      pose.position.x !== this.currentX ||
      pose.position.y !== this.currentY;
    if (changedTarget) {
      const route = stationRoutePoints(this.targetStation, pose.station);
      const middle = route.length > 2 ? route.slice(1, -1) : [];
      const meetingEgress =
        this.targetStation === "meeting"
          ? [
              { x: 304, y: this.currentY },
              { x: 304, y: 112 },
              { x: 320, y: 112 },
            ]
          : [];
      const meetingIngress =
        pose.station === "meeting"
          ? [
              { x: 304, y: 112 },
              { x: 304, y: pose.position.y },
            ]
          : [];
      this.targetStation = pose.station;
      this.currentPath = [...meetingEgress, ...middle, ...meetingIngress, pose.position].filter(
        (point, index, all) =>
          index === 0 || point.x !== all[index - 1]!.x || point.y !== all[index - 1]!.y,
      );
      this.pathIndex = 0;
      this.setSeated(false);
      this.input.onMotionChanged();
    } else if (!this.isCelebrating) {
      this.playAnimation(pose.animation);
      this.setSeated(pose.seated);
    }

    if (pose.liveEffect && pose.liveEffect.sourceSequence > this.lastEffectSequence) {
      this.lastEffectSequence = pose.liveEffect.sourceSequence;
      this.beginCelebration(pose.animation, 1);
    }
  }

  update(deltaSeconds: number): void {
    if (this.isCelebrating) {
      this.effectTimer -= deltaSeconds;
      if (this.effectTimer <= 0) {
        this.isCelebrating = false;
        this.playAnimation(this.stableAnimation);
        this.setSeated(this.desiredSeated);
        this.input.onMotionChanged();
      }
    }

    if (this.currentPath.length === 0 || this.pathIndex >= this.currentPath.length) return;
    const target = this.currentPath[this.pathIndex]!;
    const dx = target.x - this.currentX;
    const dy = target.y - this.currentY;
    const distance = Math.hypot(dx, dy);
    const movement = 64 * deltaSeconds;

    if (distance <= movement) {
      this.currentX = target.x;
      this.currentY = target.y;
      this.pathIndex++;
      if (this.pathIndex >= this.currentPath.length) {
        this.currentPath = [];
        this.playAnimation(this.stableAnimation);
        this.setSeated(this.desiredSeated);
        this.input.onMotionChanged();
      }
    } else {
      const ratio = movement / distance;
      this.currentX += dx * ratio;
      this.currentY += dy * ratio;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.playAnimation(dx > 0 ? "walk.right" : "walk.left");
      } else {
        this.playAnimation(dy > 0 ? "walk.down" : "walk.up");
      }
    }
    this.container.position.set(this.currentX, this.currentY);
    this.container.zIndex = this.currentY;
  }

  isSettled(): boolean {
    return this.currentPath.length === 0 && !this.isCelebrating;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private finishAtPose(pose: ActorPose): void {
    this.currentX = pose.position.x;
    this.currentY = pose.position.y;
    this.container.position.set(this.currentX, this.currentY);
    this.container.zIndex = this.currentY;
    this.targetStation = pose.station;
    this.currentPath = [];
    this.pathIndex = 0;
    this.playAnimation(pose.animation);
    this.setSeated(pose.seated);
  }

  private beginCelebration(stableAnimation: CharacterAnimation, duration: number): void {
    this.stableAnimation = stableAnimation;
    this.setSeated(false);
    this.playAnimation("celebrate.down");
    this.isCelebrating = true;
    this.effectTimer = duration;
  }

  private setSeated(seated: boolean): void {
    this.seated = seated;
    if (this.chairSprite) this.chairSprite.visible = seated;
    this.seatingMask.visible = seated;
    if (this.animatedSprite) this.animatedSprite.mask = seated ? this.seatingMask : null;
  }

  private playAnimation(animation: CharacterAnimation): void {
    if (this.activeAnimation === animation && this.animatedSprite) return;
    this.activeAnimation = animation;
    if (this.animatedSprite) {
      this.container.removeChild(this.animatedSprite);
      this.animatedSprite.destroy();
    }
    const textures = this.input.textures[animation] || this.input.textures["idle.down"];
    if (!textures?.length) return;
    this.animatedSprite = new AnimatedSprite(textures);
    this.animatedSprite.animationSpeed = animation.startsWith("walk") ? 0.14 : 0.1;
    this.animatedSprite.anchor.set(0.5, 1);
    this.animatedSprite.mask = this.seated ? this.seatingMask : null;
    this.animatedSprite.play();
    this.container.addChild(this.animatedSprite);
  }
}
