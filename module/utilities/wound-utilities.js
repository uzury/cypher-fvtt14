const WOUND_TYPES = ["minor", "moderate", "major"];

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function readWoundEntry(system, type) {
  const source = system?.combat?.wounds?.[type] ?? {};
  const max = Math.max(1, toInteger(source.max, 3));
  const value = Math.min(max, Math.max(0, toInteger(source.value, 0)));
  return {value, max};
}

export function getWoundState(actor) {
  const system = actor?.system ?? actor ?? {};
  const minor = readWoundEntry(system, "minor");
  const moderate = readWoundEntry(system, "moderate");
  const major = readWoundEntry(system, "major");

  const hindrance = (moderate.value >= moderate.max ? 1 : 0) + major.value;
  const dead = major.value >= major.max;

  return {minor, moderate, major, hindrance, dead};
}

export function getWoundHindrance(actor) {
  return getWoundState(actor).hindrance;
}

export function isDeadFromWounds(actor) {
  return getWoundState(actor).dead;
}

function calculateWoundApplication(actor, severity, amount = 1) {
  if (!WOUND_TYPES.includes(severity)) throw new RangeError(`Unknown wound severity: ${severity}`);

  let remaining = Math.max(0, toInteger(amount, 0));
  const state = getWoundState(actor);
  const nextValues = {
    minor: state.minor.value,
    moderate: state.moderate.value,
    major: state.major.value
  };
  const maxValues = {
    minor: state.minor.max,
    moderate: state.moderate.max,
    major: state.major.max
  };

  for (let index = WOUND_TYPES.indexOf(severity); index < WOUND_TYPES.length && remaining > 0; index += 1) {
    const type = WOUND_TYPES[index];
    const available = Math.max(0, maxValues[type] - nextValues[type]);
    const applied = Math.min(available, remaining);
    nextValues[type] += applied;
    remaining -= applied;
  }

  return {
    minor: {value: nextValues.minor, max: maxValues.minor},
    moderate: {value: nextValues.moderate, max: maxValues.moderate},
    major: {value: nextValues.major, max: maxValues.major},
    hindrance: (nextValues.moderate >= maxValues.moderate ? 1 : 0) + nextValues.major,
    dead: nextValues.major >= maxValues.major,
    overflow: remaining
  };
}

export function getTreatmentDifficulty(severity) {
  if (!WOUND_TYPES.includes(severity)) throw new RangeError(`Unknown wound severity: ${severity}`);
  return {minor: 0, moderate: 3, major: 6}[severity];
}

export function getSuggestedTreatmentTime(severity) {
  if (!WOUND_TYPES.includes(severity)) throw new RangeError(`Unknown wound severity: ${severity}`);
  return {minor: "1 minute", moderate: "10 minutes", major: "1 hour"}[severity];
}

export function getRallyCost(severity, {allowMajor = false} = {}) {
  if (!WOUND_TYPES.includes(severity)) throw new RangeError(`Unknown wound severity: ${severity}`);
  if (severity === "major" && !allowMajor) return null;
  return {minor: 2, moderate: 5, major: 10}[severity];
}

export async function removeWound(actor, severity, amount = 1) {
  if (!actor?.update) throw new TypeError("removeWound requires an Actor-like object with update().");
  if (!WOUND_TYPES.includes(severity)) throw new RangeError(`Unknown wound severity: ${severity}`);

  const state = getWoundState(actor);
  if (state.dead) throw new RangeError("A dead character cannot remove Wounds through ordinary healing.");

  const requested = Math.max(0, toInteger(amount, 0));
  const previous = state[severity].value;
  const removed = Math.min(previous, requested);
  const value = previous - removed;

  if (removed > 0) {
    await actor.update({[`system.combat.wounds.${severity}.value`]: value});
  }

  return {severity, previous, value, removed};
}

export async function rallyWound(actor, severity, {allowMajor = false} = {}) {
  if (!actor?.update) throw new TypeError("rallyWound requires an Actor-like object with update().");
  if (!WOUND_TYPES.includes(severity)) throw new RangeError(`Unknown wound severity: ${severity}`);

  const state = getWoundState(actor);
  if (state.dead) throw new RangeError("A dead character cannot rally.");
  if (state[severity].value < 1) throw new RangeError(`No ${severity} Wound is available to rally.`);

  const cost = getRallyCost(severity, {allowMajor});
  if (cost === null) throw new RangeError("Major Wounds can only be rallied in superheroic games.");

  const might = Math.max(0, toInteger(actor.system?.pools?.might?.value, 0));
  if (might < cost) throw new RangeError(`Rally requires ${cost} Might, but only ${might} is available.`);

  const woundValue = state[severity].value - 1;
  await actor.update({
    "system.pools.might.value": might - cost,
    [`system.combat.wounds.${severity}.value`]: woundValue
  });

  return {
    severity,
    cost,
    previousMight: might,
    might: might - cost,
    previousWounds: state[severity].value,
    wounds: woundValue
  };
}

export function poolDamageToWoundSeverity(damage) {
  const amount = Math.max(0, toInteger(damage, 0));
  if (amount === 0) return null;
  if (amount <= 4) return "minor";
  if (amount <= 8) return "moderate";
  return "major";
}

export async function applyWound(actor, severity, amount = 1) {
  if (!actor?.update) throw new TypeError("applyWound requires an Actor-like object with update().");

  const result = calculateWoundApplication(actor, severity, amount);
  if (Math.max(0, toInteger(amount, 0)) === 0) return result;

  await actor.update({
    "system.combat.wounds.minor.value": result.minor.value,
    "system.combat.wounds.moderate.value": result.moderate.value,
    "system.combat.wounds.major.value": result.major.value
  });

  return result;
}

export async function applyPoolDamage(actor, pool, damage) {
  if (!actor?.update) throw new TypeError("applyPoolDamage requires an Actor-like object with update().");

  const poolKeys = {
    Might: "might",
    Speed: "speed",
    Intellect: "intellect"
  };
  const normalizedPool = String(pool ?? "").trim();
  const poolKey = poolKeys[normalizedPool];
  if (!poolKey) throw new RangeError(`Unknown stat Pool: ${pool}`);

  const amount = Math.max(0, toInteger(damage, 0));
  const poolPath = `system.pools.${poolKey}.value`;
  const previousPool = Math.max(0, toInteger(actor.system?.pools?.[poolKey]?.value, 0));

  if (amount === 0) {
    return {
      pool: normalizedPool,
      damage: 0,
      previousPool,
      poolValue: previousPool,
      overflowDamage: 0,
      woundSeverity: null,
      woundState: getWoundState(actor)
    };
  }

  const poolValue = Math.max(0, previousPool - amount);
  const overflowDamage = Math.max(0, amount - previousPool);
  const woundSeverity = poolDamageToWoundSeverity(overflowDamage);
  const woundState = woundSeverity
    ? calculateWoundApplication(actor, woundSeverity, 1)
    : getWoundState(actor);

  const changes = {[poolPath]: poolValue};
  if (woundSeverity) {
    changes["system.combat.wounds.minor.value"] = woundState.minor.value;
    changes["system.combat.wounds.moderate.value"] = woundState.moderate.value;
    changes["system.combat.wounds.major.value"] = woundState.major.value;
  }

  // Pool value and any converted Wound are committed in one Actor update so
  // the sheet never renders an intermediate, mechanically impossible state.
  await actor.update(changes);

  return {
    pool: normalizedPool,
    damage: amount,
    previousPool,
    poolValue,
    overflowDamage,
    woundSeverity,
    woundState
  };
}
