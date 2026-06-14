export type StatefulRng = {
  next(): number;
  state(): number;
  setState(seed: number): void;
};

const DEFAULT_SEED = 0xc0115a1e;

export function createStatefulRng(seed: number): StatefulRng {
  let state = normalizeSeed(seed);
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    },
    state() {
      return state >>> 0;
    },
    setState(seedValue: number) {
      state = normalizeSeed(seedValue);
    }
  };
}

export function seedFromSearch(search: string | undefined, paramName: string, fallback = DEFAULT_SEED): number {
  const raw = new URLSearchParams(search ?? "").get(paramName);
  if (raw === null || raw.trim() === "") {
    return normalizeSeed(fallback);
  }
  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric)) {
    return normalizeSeed(numeric);
  }
  return hashSeed(raw);
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return normalizeSeed(hash);
}

export function normalizeSeed(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SEED;
  }
  return Math.floor(value) >>> 0;
}
