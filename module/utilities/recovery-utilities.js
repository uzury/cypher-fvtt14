const RECOVERY_TYPES = ["oneAction", "tenMinutes", "oneHour", "tenHours"];
const POOL_KEYS = ["might", "speed", "intellect"];

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function recoveryCount(actor, type) {
  const combatSettings = actor?.system?.settings?.combat ?? {};
  if (type === "oneAction") {
    return Math.max(1, Math.min(7, integer(combatSettings.numberOneActionRecoveries, 1)));
  }
  if (type === "tenMinutes") {
    return Math.max(1, Math.min(2, integer(combatSettings.numberTenMinuteRecoveries, 1)));
  }
  return 1;
}

function recoveryProperties(type, count) {
  if (type === "oneHour" || type === "tenHours") return [type];
  return Array.from({length: count}, (_, index) => index === 0 ? type : `${type}${index + 1}`);
}

export function getC2RecoveryOptions(actor) {
  const recoveries = actor?.system?.combat?.recoveries ?? {};

  return RECOVERY_TYPES.map(type => {
    const properties = recoveryProperties(type, recoveryCount(actor, type));
    const available = properties.filter(property => !recoveries[property]);
    return {
      type,
      total: properties.length,
      used: properties.length - available.length,
      remaining: available.length,
      nextProperty: available[0] ?? null,
      nextPath: available[0] ? `system.combat.recoveries.${available[0]}` : null
    };
  });
}

export function getC2RecoveryFormula(actor, {lastAction = false, bonus = 0} = {}) {
  const tier = Math.max(1, integer(actor?.system?.basic?.tier, 1));
  const extra = integer(bonus, 0) + (lastAction ? 2 : 0);
  const bonusText = extra > 0 ? `+${extra}` : extra < 0 ? String(extra) : "";
  return `1d6+${tier}${bonusText}`;
}

function lastingDamageByPool(actor) {
  const totals = {might: 0, speed: 0, intellect: 0};
  for (const item of actor?.items ?? []) {
    if (item.type !== "lasting-damage" || item.system?.archived) continue;
    const pool = String(item.system?.basic?.pool ?? "").toLowerCase();
    if (!(pool in totals)) continue;
    totals[pool] += Math.max(0, integer(item.system?.basic?.damage, 0));
  }
  return totals;
}

export function getC2RecoveryPoolState(actor) {
  const lasting = lastingDamageByPool(actor);
  const state = {};

  for (const key of POOL_KEYS) {
    const pool = actor?.system?.pools?.[key] ?? {};
    const baseMax = Math.max(0, integer(pool.max, 0));
    const effectiveMax = Math.max(0, baseMax - lasting[key]);
    const value = Math.max(0, Math.min(effectiveMax, integer(pool.value, 0)));
    state[key] = {
      value,
      baseMax,
      effectiveMax,
      missing: Math.max(0, effectiveMax - value),
      lastingDamage: lasting[key]
    };
  }

  return state;
}

function currentWounds(actor) {
  const wounds = actor?.system?.combat?.wounds ?? {};
  const read = type => {
    const source = wounds[type] ?? {};
    const max = Math.max(1, integer(source.max, 3));
    return {value: Math.max(0, Math.min(max, integer(source.value, 0))), max};
  };
  return {minor: read("minor"), moderate: read("moderate"), major: read("major")};
}

function woundLabel(count, severity) {
  return `${count} ${severity} Wound${count === 1 ? "" : "s"}`;
}

function calculateRestHealing(actor, type, choice = "") {
  const wounds = currentWounds(actor);
  const updates = {};
  let summary = "No Wounds removed by this recovery.";

  if (type === "tenMinutes") {
    if (wounds.minor.value > 0) {
      updates["system.combat.wounds.minor.value"] = 0;
      summary = `Removed all ${woundLabel(wounds.minor.value, "Minor")}.`;
    }
  } else if (type === "oneHour") {
    if (choice === "minor" && wounds.minor.value > 0) {
      updates["system.combat.wounds.minor.value"] = 0;
      summary = `Removed all ${woundLabel(wounds.minor.value, "Minor")}.`;
    } else if (wounds.moderate.value > 0) {
      updates["system.combat.wounds.moderate.value"] = wounds.moderate.value - 1;
      summary = "Removed one Moderate Wound.";
    } else if (wounds.minor.value > 0) {
      updates["system.combat.wounds.minor.value"] = 0;
      summary = `Removed all ${woundLabel(wounds.minor.value, "Minor")}.`;
    }
  } else if (type === "tenHours") {
    if (choice === "minorExchange" && wounds.minor.value > 0 && wounds.moderate.value > 0) {
      updates["system.combat.wounds.minor.value"] = 0;
      updates["system.combat.wounds.moderate.value"] = 1;
      summary = "Removed all Minor Wounds and all but one Moderate Wound.";
    } else if (wounds.moderate.value > 0) {
      updates["system.combat.wounds.moderate.value"] = 0;
      summary = `Removed all ${woundLabel(wounds.moderate.value, "Moderate")}.`;
    }
  }

  return {
    updates,
    summary,
    majorCheckRequired: type === "tenHours" && wounds.major.value > 0,
    majorBefore: wounds.major.value
  };
}

export async function applyC2Recovery(actor, {type, recoveredPoints, allocations = {}, restChoice = ""} = {}) {
  if (!actor?.update) throw new TypeError("applyC2Recovery requires an Actor-like object with update().");
  if (!RECOVERY_TYPES.includes(type)) throw new RangeError(`Unknown recovery type: ${type}`);
  if (actor.system?.basic?.unmaskedForm === "Teen") {
    throw new RangeError("Cypher 2026 recoveries are not enabled for the legacy Teen form.");
  }

  const option = getC2RecoveryOptions(actor).find(entry => entry.type === type);
  if (!option?.nextPath) throw new RangeError("No unused recovery of that type is available.");

  const points = Math.max(0, integer(recoveredPoints, 0));
  const pools = getC2RecoveryPoolState(actor);
  const normalized = {};
  let allocatedTotal = 0;

  for (const key of POOL_KEYS) {
    const amount = Math.max(0, integer(allocations[key], 0));
    if (amount > pools[key].missing) {
      throw new RangeError(`${key} recovery exceeds the Pool's effective maximum.`);
    }
    normalized[key] = amount;
    allocatedTotal += amount;
  }

  if (allocatedTotal > points) {
    throw new RangeError(`Allocated ${allocatedTotal} points, but the recovery only provides ${points}.`);
  }

  const changes = {[option.nextPath]: true};
  for (const key of POOL_KEYS) {
    if (normalized[key] > 0) {
      changes[`system.pools.${key}.value`] = pools[key].value + normalized[key];
    }
  }

  const rest = calculateRestHealing(actor, type, restChoice);
  Object.assign(changes, rest.updates);
  await actor.update(changes);

  return {
    type,
    slotPath: option.nextPath,
    recoveredPoints: points,
    allocatedTotal,
    unspent: points - allocatedTotal,
    allocations: normalized,
    restSummary: rest.summary,
    majorCheckRequired: rest.majorCheckRequired,
    majorBefore: rest.majorBefore
  };
}
