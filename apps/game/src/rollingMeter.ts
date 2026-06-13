export type RollingMeterState = {
  displayed: number;
  target: number;
  ratePerSec: number;
  isRolling: boolean;
  stepRemainder: number;
};

export type SurviveFatalBlowWindowOptions = {
  initialDisplayed: number;
  ratePerSec: number;
  elapsedBeforeRescueMs: number;
  rescueTarget: number;
};

export function createRollingMeter(displayed: number, ratePerSec: number): RollingMeterState {
  const value = clampHp(displayed);
  return {
    displayed: value,
    target: value,
    ratePerSec: Math.max(1, Math.floor(ratePerSec)),
    isRolling: false,
    stepRemainder: 0
  };
}

export function setTarget(state: RollingMeterState, target: number): RollingMeterState {
  const nextTarget = clampHp(target);
  return {
    ...state,
    target: nextTarget,
    isRolling: state.displayed !== nextTarget,
    stepRemainder: 0
  };
}

export function tick(state: RollingMeterState, dtMs: number): RollingMeterState {
  if (!state.isRolling || state.displayed === state.target || dtMs <= 0) {
    return {
      ...state,
      isRolling: state.displayed !== state.target
    };
  }

  const distance = state.target - state.displayed;
  const direction = Math.sign(distance);
  const stepsFloat = state.stepRemainder + (state.ratePerSec * dtMs) / 1000;
  const steps = Math.floor(stepsFloat);
  if (steps <= 0) {
    return {
      ...state,
      stepRemainder: stepsFloat,
      isRolling: true
    };
  }

  const move = Math.min(Math.abs(distance), steps) * direction;
  const displayed = state.displayed + move;
  const reachedTarget = displayed === state.target;
  return {
    ...state,
    displayed,
    isRolling: !reachedTarget,
    stepRemainder: reachedTarget ? 0 : stepsFloat - steps
  };
}

export function isDepleted(state: Pick<RollingMeterState, "displayed">): boolean {
  return state.displayed <= 0;
}

export function survivesFatalBlowWindow(options: SurviveFatalBlowWindowOptions): boolean {
  const fatal = setTarget(createRollingMeter(options.initialDisplayed, options.ratePerSec), 0);
  const beforeRescue = tick(fatal, options.elapsedBeforeRescueMs);
  const rescued = setTarget(beforeRescue, options.rescueTarget);
  return !isDepleted(rescued);
}

function clampHp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
