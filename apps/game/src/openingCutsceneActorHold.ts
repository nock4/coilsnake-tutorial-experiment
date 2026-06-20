export type PausedActorState = {
  paused: boolean;
};

export class OpeningCutsceneActorHoldSet {
  private readonly heldActors = new Map<string, boolean>();

  get size(): number {
    return this.heldActors.size;
  }

  hold(key: string, state: PausedActorState, restorePaused: boolean): void {
    if (!this.heldActors.has(key)) {
      this.heldActors.set(key, restorePaused);
    }
    state.paused = true;
  }

  release(resolve: (key: string) => PausedActorState | undefined): void {
    for (const [key, restorePaused] of this.heldActors) {
      const state = resolve(key);
      if (state) {
        state.paused = restorePaused;
      }
    }
    this.heldActors.clear();
  }

  clear(): void {
    this.heldActors.clear();
  }
}
