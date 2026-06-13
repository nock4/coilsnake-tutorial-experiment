import Phaser from "phaser";
import type { BattleData, BattleEnemy, BattleGroup, CharacterCollection } from "@eb/schemas";
import {
  combatantAt,
  createBattleState,
  firstLivingIndex,
  isCombatantAlive,
  outcome,
  resolveTurn,
  tickBattleMeters,
  turnOrder,
  type BattleActor,
  type BattleOutcome,
  type BattleState,
  type Rng
} from "./battleLogic";
import { publishBattleDebug, type BattlePhase } from "./state";

const MONO = "Menlo, Consolas, monospace";
const COMMANDS = ["BASH", "RUN"] as const;
const STATUS_TOP = 326;
const PADDED_HP_DIGITS = 3;
const ACTION_ADVANCE_DELAY_MS = 350;

export class BattleScene extends Phaser.Scene {
  private battleData_!: BattleData;
  private group_!: BattleGroup;
  private battle_!: BattleState;
  private rng_: Rng = () => 0.5;
  private phase_: BattlePhase = "menu";
  private menuIndex_ = 0;
  private targetIndex_ = 0;
  private roundOrder_: BattleActor[] = [];
  private roundCursor_ = 0;
  private currentActor_: BattleActor | null = null;
  private actionDelayMs_ = 0;
  private statusGraphics?: Phaser.GameObjects.Graphics;
  private targetCursor?: Phaser.GameObjects.Graphics;
  private commandText?: Phaser.GameObjects.Text;
  private partyText?: Phaser.GameObjects.Text;
  private enemySprites: Phaser.GameObjects.Image[] = [];

  constructor() {
    super("battle");
  }

  init(data: { battleData: BattleData; groupId?: number; characters?: CharacterCollection }): void {
    this.battleData_ = data.battleData;
    this.group_ = selectBattleGroup(data.battleData, data.groupId);
    const enemies = enemiesForGroup(data.battleData, this.group_);
    if (enemies.length === 0) {
      throw new Error(`Battle group ${this.group_.id} has no matching runtime enemy.`);
    }
    this.battle_ = createBattleState(enemies, { characters: data.characters });
    this.rng_ = createSeededRng((this.group_.id + 1) * 65537 + enemies.reduce((sum, enemy) => sum + enemy.id, 0));
    this.phase_ = "menu";
    this.menuIndex_ = 0;
    this.targetIndex_ = 0;
    this.roundOrder_ = [];
    this.roundCursor_ = 0;
    this.currentActor_ = null;
    this.actionDelayMs_ = 0;
  }

  preload(): void {
    for (const backgroundId of unique([this.group_.background1, this.group_.background2])) {
      this.load.image(backgroundKey(backgroundId), generatedAssetUrl(this.battleData_.assetLayout.backgroundDir, backgroundId));
    }
    for (const enemy of enemiesForGroup(this.battleData_, this.group_)) {
      this.load.image(spriteKey(enemy.spriteId), generatedAssetUrl(this.battleData_.assetLayout.spriteDir, enemy.spriteId));
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050505");
    this.drawBackground();
    this.drawEnemySprites();
    this.createStatusWindow();
    this.input.keyboard?.on("keydown-UP", () => this.moveMenu(-1));
    this.input.keyboard?.on("keydown-DOWN", () => this.moveMenu(1));
    this.input.keyboard?.on("keydown-LEFT", () => this.moveTarget(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.moveTarget(1));
    this.input.keyboard?.on("keydown-SPACE", () => this.confirmMenu());
    this.input.keyboard?.on("keydown-ENTER", () => this.confirmMenu());
    this.advanceToNextActor();
    this.renderStatus();
    this.publish();
  }

  update(_: number, delta: number): void {
    if (!this.isTerminalPhase()) {
      this.battle_ = tickBattleMeters(this.battle_, delta);
      this.actionDelayMs_ = Math.max(0, this.actionDelayMs_ - delta);
      this.advanceBattleFlow();
    }
    this.renderStatus();
    this.publish();
  }

  private moveMenu(direction: -1 | 1): void {
    if (this.phase_ !== "menu") {
      return;
    }
    this.menuIndex_ = (this.menuIndex_ + direction + COMMANDS.length) % COMMANDS.length;
    this.renderStatus();
    this.publish();
  }

  private moveTarget(direction: -1 | 1): void {
    if (this.phase_ !== "menu" || COMMANDS[this.menuIndex_] !== "BASH") {
      return;
    }
    const living = livingEnemyIndices(this.battle_);
    if (living.length === 0) {
      return;
    }
    const current = living.includes(this.targetIndex_) ? living.indexOf(this.targetIndex_) : 0;
    this.targetIndex_ = living[(current + direction + living.length) % living.length];
    this.renderStatus();
    this.publish();
  }

  private confirmMenu(): void {
    if (this.phase_ !== "menu" || this.currentActor_?.side !== "party") {
      return;
    }
    const command = COMMANDS[this.menuIndex_];
    if (command === "RUN") {
      this.phase_ = "flee";
      this.renderStatus();
      this.publish();
      return;
    }

    this.normalizeTargetIndex();
    const result = resolveTurn(this.battle_, this.currentActor_, this.rng_, { targetIndex: this.targetIndex_ });
    this.battle_ = result.state;
    this.phase_ = "enemy-rolling";
    this.actionDelayMs_ = ACTION_ADVANCE_DELAY_MS;
    this.renderStatus();
    this.publish();
  }

  private advanceBattleFlow(): void {
    const currentOutcome = outcome(this.battle_);
    if (currentOutcome !== "ongoing") {
      this.phase_ = currentOutcome;
      this.currentActor_ = null;
      return;
    }

    if (this.phase_ === "menu") {
      if (!this.currentActor_ || this.currentActor_.side !== "party" || !this.actorIsAlive(this.currentActor_)) {
        this.advanceToNextActor();
        return;
      }
      this.normalizeTargetIndex();
      return;
    }

    if ((this.phase_ === "enemy-rolling" || this.phase_ === "player-rolling") && this.actionDelayMs_ <= 0) {
      this.advanceToNextActor();
    }
  }

  private advanceToNextActor(): void {
    for (let guard = 0; guard < 100; guard += 1) {
      const currentOutcome = outcome(this.battle_);
      if (currentOutcome !== "ongoing") {
        this.phase_ = currentOutcome;
        this.currentActor_ = null;
        return;
      }

      if (this.roundCursor_ >= this.roundOrder_.length) {
        this.roundOrder_ = turnOrder(this.battle_);
        this.roundCursor_ = 0;
      }

      const actor = this.roundOrder_[this.roundCursor_];
      this.roundCursor_ += 1;
      if (!actor || !this.actorIsAlive(actor)) {
        continue;
      }

      this.currentActor_ = actor;
      if (actor.side === "party") {
        this.phase_ = "menu";
        this.normalizeTargetIndex();
        return;
      }

      const result = resolveTurn(this.battle_, actor, this.rng_);
      this.battle_ = result.state;
      this.phase_ = "player-rolling";
      this.actionDelayMs_ = ACTION_ADVANCE_DELAY_MS;
      return;
    }
  }

  private drawBackground(): void {
    const key = this.textures.exists(backgroundKey(this.group_.background1))
      ? backgroundKey(this.group_.background1)
      : backgroundKey(this.group_.background2);
    if (this.textures.exists(key)) {
      this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(this.scale.width, STATUS_TOP);
      return;
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(0x182033, 1);
    graphics.fillRect(0, 0, this.scale.width, STATUS_TOP);
    graphics.fillStyle(0x263248, 1);
    for (let y = 0; y < STATUS_TOP; y += 16) {
      graphics.fillRect(0, y, this.scale.width, 8);
    }
  }

  private drawEnemySprites(): void {
    const enemies = enemiesForGroup(this.battleData_, this.group_);
    const count = Math.max(1, enemies.length);
    this.enemySprites = [];
    enemies.forEach((enemy, index) => {
      const key = spriteKey(enemy.spriteId);
      if (!this.textures.exists(key)) {
        return;
      }
      const frame = this.textures.getFrame(key);
      const widthBudget = Math.max(64, 420 / count);
      const scale = Math.min(2, widthBudget / frame.width, 160 / frame.height);
      const point = enemySpritePoint(this.scale.width, count, index, widthBudget);
      this.enemySprites[index] = this.add.image(point.x, point.y, key).setOrigin(0.5, 0.5).setScale(scale).setDepth(10);
    });
  }

  private createStatusWindow(): void {
    this.statusGraphics = this.add.graphics().setDepth(20);
    this.targetCursor = this.add.graphics().setDepth(30);
    this.commandText = this.add.text(44, STATUS_TOP + 32, "", {
      fontFamily: MONO,
      fontSize: "15px",
      color: "#f8fafc",
      lineSpacing: 8
    }).setDepth(21);
    this.partyText = this.add.text(178, STATUS_TOP + 28, "", {
      fontFamily: MONO,
      fontSize: "14px",
      color: "#f8fafc",
      lineSpacing: 7
    }).setDepth(21);

    const graphics = this.statusGraphics;
    graphics.clear();
    graphics.fillStyle(0x050914, 0.98);
    graphics.fillRect(0, STATUS_TOP, this.scale.width, this.scale.height - STATUS_TOP);
    this.drawWindow(24, STATUS_TOP + 16, 120, 78);
    this.drawWindow(160, STATUS_TOP + 16, 328, 118);
  }

  private drawWindow(x: number, y: number, width: number, height: number): void {
    const graphics = this.statusGraphics;
    if (!graphics) {
      return;
    }
    graphics.fillStyle(0x0a0f1e, 1);
    graphics.fillRoundedRect(x, y, width, height, 5);
    graphics.lineStyle(3, 0xf8fafc, 1);
    graphics.strokeRoundedRect(x + 2, y + 2, width - 4, height - 4, 4);
    graphics.lineStyle(1, 0x6b7280, 1);
    graphics.strokeRoundedRect(x + 7, y + 7, width - 14, height - 14, 3);
  }

  private renderStatus(): void {
    const menuVisible = this.phase_ === "menu" && this.currentActor_?.side === "party";
    this.commandText?.setText(
      menuVisible
        ? COMMANDS.map((command, index) => `${index === this.menuIndex_ ? ">" : " "} ${command}`).join("\n")
        : ""
    );
    this.partyText?.setText(this.partyStatusLines().join("\n"));
    this.enemySprites.forEach((sprite, index) => {
      sprite?.setAlpha(isCombatantAlive(this.battle_.enemies[index]) ? 1 : 0.25);
    });
    this.renderTargetCursor(menuVisible);
  }

  private publish(): void {
    const currentOutcome: BattleOutcome = outcome(this.battle_);
    const party = this.battle_.party.map(debugCombatant);
    const enemies = this.battle_.enemies.map(debugCombatant);
    publishBattleDebug({
      mode: "battle",
      phase: this.phase_,
      menuIndex: this.menuIndex_,
      targetIndex: this.targetIndex_,
      turnOrder: this.roundOrder_.map(debugActor),
      currentActor: this.currentActor_ ? debugActor(this.currentActor_) : null,
      party,
      enemies,
      player: {
        name: this.battle_.party[0]?.name ?? "",
        hpDisplayed: party[0]?.hpDisplayed ?? 0,
        hpTarget: party[0]?.hpTarget ?? 0,
        isRolling: party[0]?.isRolling ?? false
      },
      enemy: {
        hpDisplayed: enemies[0]?.hpDisplayed ?? 0,
        hpTarget: enemies[0]?.hpTarget ?? 0,
        isRolling: enemies[0]?.isRolling ?? false
      },
      outcome: currentOutcome
    });
  }

  private actorIsAlive(actor: BattleActor): boolean {
    const combatant = combatantAt(this.battle_, actor);
    return Boolean(combatant && isCombatantAlive(combatant));
  }

  private isTerminalPhase(): boolean {
    return this.phase_ === "win" || this.phase_ === "lose" || this.phase_ === "flee";
  }

  private normalizeTargetIndex(): void {
    if (this.battle_.enemies[this.targetIndex_] && isCombatantAlive(this.battle_.enemies[this.targetIndex_])) {
      return;
    }
    const firstLiving = firstLivingIndex(this.battle_.enemies);
    this.targetIndex_ = firstLiving >= 0 ? firstLiving : 0;
  }

  private partyStatusLines(): string[] {
    return this.battle_.party.map((member, index) => {
      const cursor = this.phase_ === "menu" && this.currentActor_?.side === "party" && this.currentActor_.index === index ? ">" : " ";
      const marker = isCombatantAlive(member) ? " " : "X";
      return `${cursor}${marker} ${fitName(member.name, 9)} HP ${odometer(member.hp.displayed)} PP ${odometer(member.pp)}`;
    });
  }

  private renderTargetCursor(menuVisible: boolean): void {
    const cursor = this.targetCursor;
    if (!cursor) {
      return;
    }
    cursor.clear();
    if (!menuVisible || COMMANDS[this.menuIndex_] !== "BASH") {
      return;
    }
    this.normalizeTargetIndex();
    const target = this.enemySprites[this.targetIndex_];
    if (!target || !isCombatantAlive(this.battle_.enemies[this.targetIndex_])) {
      return;
    }
    const x = target.x;
    const y = target.y - target.displayHeight / 2 - 16;
    cursor.fillStyle(0xf8fafc, 1);
    cursor.fillTriangle(x, y + 14, x - 9, y, x + 9, y);
    cursor.lineStyle(1, 0x111827, 1);
    cursor.strokeTriangle(x, y + 14, x - 9, y, x + 9, y);
  }
}

function selectBattleGroup(data: BattleData, groupId: number | undefined): BattleGroup {
  return data.groups.find((group) => group.id === groupId) ?? data.groups[0];
}

function enemiesForGroup(data: BattleData, group: BattleGroup): BattleEnemy[] {
  return group.enemyIds
    .map((enemyId) => data.enemies.find((enemy) => enemy.id === enemyId))
    .filter((enemy): enemy is BattleEnemy => Boolean(enemy));
}

function generatedAssetUrl(dir: string, id: number): string {
  return `/generated/${dir}/${pad3(id)}.png`;
}

function backgroundKey(id: number): string {
  return `battle-bg-${id}`;
}

function spriteKey(id: number): string {
  return `battle-sprite-${id}`;
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function debugCombatant(combatant: BattleState["party"][number]): {
  hpDisplayed: number;
  hpTarget: number;
  isRolling: boolean;
  alive: boolean;
} {
  return {
    hpDisplayed: combatant.hp.displayed,
    hpTarget: combatant.hp.target,
    isRolling: combatant.hp.isRolling,
    alive: isCombatantAlive(combatant)
  };
}

function debugActor(actor: BattleActor): { side: "party" | "enemy"; index: number } {
  return { side: actor.side, index: actor.index };
}

function enemySpritePoint(stageWidth: number, count: number, index: number, widthBudget: number): { x: number; y: number } {
  return {
    x: stageWidth / 2 + (index - (count - 1) / 2) * widthBudget,
    y: 164
  };
}

function fitName(name: string, width: number): string {
  return name.length > width ? name.slice(0, width) : name.padEnd(width, " ");
}

function livingEnemyIndices(state: BattleState): number[] {
  return state.enemies.flatMap((enemy, index) => (isCombatantAlive(enemy) ? [index] : []));
}

function odometer(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(PADDED_HP_DIGITS, "0");
}

function unique(values: number[]): number[] {
  return [...new Set(values)];
}

function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
