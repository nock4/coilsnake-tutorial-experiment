export class GameFlags {
  private readonly flags = new Set<string>();
  private readonly numericFlags = new Set<number>();

  set(flag: string): void {
    this.flags.add(flag);
  }

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  /** Numeric EarthBound event flags are session-only and start all clear. */
  setNum(flag: number): void {
    this.numericFlags.add(normalizeNum(flag));
  }

  unsetNum(flag: number): void {
    this.numericFlags.delete(normalizeNum(flag));
  }

  isSet(flag: number): boolean {
    return this.numericFlags.has(normalizeNum(flag));
  }

  clear(): void {
    this.flags.clear();
    this.numericFlags.clear();
  }

  list(): string[] {
    return [...this.flags];
  }

  listNums(): number[] {
    return [...this.numericFlags].sort((a, b) => a - b);
  }
}

export function talkedFlag(npcId: number): string {
  return `npc:${npcId}:talked`;
}

function normalizeNum(flag: number): number {
  if (!Number.isInteger(flag) || flag < 0) {
    throw new Error(`Invalid numeric event flag: ${flag}`);
  }
  return flag;
}
