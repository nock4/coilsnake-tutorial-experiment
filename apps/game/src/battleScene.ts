import Phaser from "phaser";
import type { BattleData, BattleEnemy, BattleGroup } from "@eb/schemas";
import {
  createBattleState,
  outcome,
  resolveTurn,
  tickBattleMeters,
  type BattleOutcome,
  type BattleState,
  type Rng
} from "./battleLogic";
import { publishBattleDebug, type BattlePhase } from "./state";

const MONO = "Menlo, Consolas, monospace";
const COMMANDS = ["BASH", "RUN"] as const;
const STATUS_TOP = 326;
const PADDED_HP_DIGITS = 3;

export class BattleScene extends Phaser.Scene {
  private battleData_!: BattleData;
  private group_!: BattleGroup;
  private primaryEnemy_!: BattleEnemy;
  private battle_!: BattleState;
  private rng_: Rng = () => 0.5;
  private phase_: BattlePhase = "menu";
  private menuIndex_ = 0;
  private statusGraphics?: Phaser.GameObjects.Graphics;
  private commandText?: Phaser.GameObjects.Text;
  private hpText?: Phaser.GameObjects.Text;
  private ppText?: Phaser.GameObjects.Text;

  constructor() {
    super("battle");
  }

  init(data: { battleData: BattleData; groupId?: number }): void {
    this.battleData_ = data.battleData;
    this.group_ = selectBattleGroup(data.battleData, data.groupId);
    const enemy = firstEnemyForGroup(data.battleData, this.group_);
    if (!enemy) {
      throw new Error(`Battle group ${this.group_.id} has no matching runtime enemy.`);
    }
    this.primaryEnemy_ = enemy;
    this.battle_ = createBattleState(enemy);
    this.rng_ = createSeededRng((this.group_.id + 1) * 65537 + enemy.id);
    this.phase_ = "menu";
    this.menuIndex_ = 0;
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
    this.input.keyboard?.on("keydown-SPACE", () => this.confirmMenu());
    this.input.keyboard?.on("keydown-ENTER", () => this.confirmMenu());
    this.renderStatus();
    this.publish();
  }

  update(_: number, delta: number): void {
    if (this.phase_ === "enemy-rolling" || this.phase_ === "player-rolling") {
      this.battle_ = tickBattleMeters(this.battle_, delta);
      this.advanceRollingPhase();
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

  private confirmMenu(): void {
    if (this.phase_ !== "menu") {
      return;
    }
    const command = COMMANDS[this.menuIndex_];
    if (command === "RUN") {
      this.phase_ = "flee";
      this.renderStatus();
      this.publish();
      return;
    }

    const result = resolveTurn(this.battle_, "player", this.rng_);
    this.battle_ = result.state;
    this.phase_ = "enemy-rolling";
    this.renderStatus();
    this.publish();
  }

  private advanceRollingPhase(): void {
    const currentOutcome = outcome(this.battle_);
    if (this.phase_ === "enemy-rolling" && !this.battle_.enemy.hp.isRolling) {
      if (currentOutcome === "win") {
        this.phase_ = "win";
        return;
      }
      const enemyTurn = resolveTurn(this.battle_, "enemy", this.rng_);
      this.battle_ = enemyTurn.state;
      this.phase_ = "player-rolling";
      return;
    }

    if (this.phase_ === "player-rolling" && !this.battle_.player.hp.isRolling) {
      this.phase_ = currentOutcome === "lose" ? "lose" : "menu";
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
    enemies.forEach((enemy, index) => {
      const key = spriteKey(enemy.spriteId);
      if (!this.textures.exists(key)) {
        return;
      }
      const frame = this.textures.getFrame(key);
      const widthBudget = Math.max(64, 420 / count);
      const scale = Math.min(2, widthBudget / frame.width, 160 / frame.height);
      const x = this.scale.width / 2 + (index - (count - 1) / 2) * widthBudget;
      this.add.image(x, 164, key).setOrigin(0.5, 0.5).setScale(scale).setDepth(10);
    });
  }

  private createStatusWindow(): void {
    this.statusGraphics = this.add.graphics().setDepth(20);
    this.commandText = this.add.text(44, STATUS_TOP + 32, "", {
      fontFamily: MONO,
      fontSize: "15px",
      color: "#f8fafc",
      lineSpacing: 8
    }).setDepth(21);
    this.hpText = this.add.text(178, STATUS_TOP + 30, "", {
      fontFamily: MONO,
      fontSize: "18px",
      color: "#f8fafc"
    }).setDepth(21);
    this.ppText = this.add.text(178, STATUS_TOP + 62, "", {
      fontFamily: MONO,
      fontSize: "16px",
      color: "#dbeafe"
    }).setDepth(21);

    const graphics = this.statusGraphics;
    graphics.clear();
    graphics.fillStyle(0x050914, 0.98);
    graphics.fillRect(0, STATUS_TOP, this.scale.width, this.scale.height - STATUS_TOP);
    this.drawWindow(24, STATUS_TOP + 16, 120, 78);
    this.drawWindow(160, STATUS_TOP + 16, 328, 78);
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
    const menuVisible = this.phase_ === "menu";
    this.commandText?.setText(
      menuVisible
        ? COMMANDS.map((command, index) => `${index === this.menuIndex_ ? ">" : " "} ${command}`).join("\n")
        : ""
    );
    this.hpText?.setText(`${this.battle_.player.name}  HP ${odometer(this.battle_.player.hp.displayed)}`);
    this.ppText?.setText(`PP ${odometer(0)}`);
  }

  private publish(): void {
    const currentOutcome: BattleOutcome = outcome(this.battle_);
    publishBattleDebug({
      mode: "battle",
      phase: this.phase_,
      menuIndex: this.menuIndex_,
      player: {
        name: this.battle_.player.name,
        hpDisplayed: this.battle_.player.hp.displayed,
        hpTarget: this.battle_.player.hp.target,
        isRolling: this.battle_.player.hp.isRolling
      },
      enemy: {
        hpDisplayed: this.battle_.enemy.hp.displayed,
        hpTarget: this.battle_.enemy.hp.target,
        isRolling: this.battle_.enemy.hp.isRolling
      },
      outcome: currentOutcome
    });
  }
}

function selectBattleGroup(data: BattleData, groupId: number | undefined): BattleGroup {
  return data.groups.find((group) => group.id === groupId) ?? data.groups[0];
}

function firstEnemyForGroup(data: BattleData, group: BattleGroup): BattleEnemy | undefined {
  return enemiesForGroup(data, group)[0];
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
