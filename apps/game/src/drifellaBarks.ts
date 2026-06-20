export function stableHash(npcId: number): number {
  if (!Number.isSafeInteger(npcId) || npcId < 0) {
    throw new Error(`NPC id must be a nonnegative safe integer: ${npcId}`);
  }
  let value = npcId >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

export function drifellaBarkForNpcId(npcId: number, pool: readonly string[]): string {
  if (pool.length === 0) {
    throw new Error("Drifella bark pool must not be empty.");
  }
  return pool[stableHash(npcId) % pool.length];
}
