import {summaryCheckEffort} from "../../forms/roll-engine-dialog-sheet.js";
import {adjustPoolPointsExact, payPoolPoints} from "../actor-utilities.js";
import {rollEngineForm} from "./roll-engine-form.js";
import {useEffectiveDifficulty} from "./roll-engine-main.js";
import {rollEngineOutput} from "./roll-engine-output.js";
import {getWoundHindrance} from "../wound-utilities.js";
import {getArmorRollModifier} from "../armor-utilities.js";
import {getNatural20CostTransition} from "./roll-cost-utilities.js";

export async function rollEngineComputation(data) {
  let actor = fromUuidSync(data.actorUuid);

  // Determine whether roll formula
  let teen = actor.system.basic.unmaskedForm == "Teen" ? true : false;
  let rollFormula = "1d20";
  if (teen && actor.system.teen.settings.general.rollTwoD20 && !data.reroll) {
    rollFormula = "2d20kh1";
  } else if (!teen && actor.system.settings.general.rollTwoD20 && !data.reroll) {
    rollFormula = "2d20kh1";
  }

  // Roll dice
  data.roll = await new Roll(rollFormula).evaluate();

  // Check for effort
  data.effortTotal = data.effortToEase + data.effortOtherUses + data.effortDamage - data.freeEffort;
  data.effortUltimateDamageTotal = data.effortToEase + data.effortOtherUses - data.freeEffort;
  data.effortApplied = data.effortToEase + data.effortOtherUses + data.effortDamage;

  if (!game.settings.get("cyphersystem", "ruleBreakingRolls") && summaryCheckEffort(actor, data)) {
    return ui.notifications.info(game.i18n.localize("CYPHERSYSTEM.SpendTooMuchEffort"));
  }

  // Legacy Teen damage-track behavior remains isolated to the Teen form.
  // Cypher 2026 PCs use Wounds instead of Impaired/Debilitated.
  data.impairedStatus = false;
  if (data.teen) {
    if (
      actor.system.teen.combat.damageTrack.state == "Impaired" &&
      actor.system.teen.combat.damageTrack.applyImpaired
    )
      data.impairedStatus = true;
    if (
      actor.system.teen.combat.damageTrack.state == "Debilitated" &&
      actor.system.teen.combat.damageTrack.applyDebilitated
    )
      data.impairedStatus = true;
  }

  data.woundHindrance = data.teen ? 0 : getWoundHindrance(actor);

  // Cypher 2026 armor modifies difficulty, not Effort cost.
  data.armorProfile = data.teen
    ? {steps: 0, modifier: 0, reason: "", typeLabel: "", freelyUse: false}
    : getArmorRollModifier(actor, {pool: data.pool, armorTask: data.armorTask});
  data.armorModifier = data.armorProfile.modifier;

  // Determine stressModifier
  if (actor.system.settings.combat.stress.active && !data.teen) {
    data.stressModifier = actor.system.combat.stress.levels;
  } else {
    data.stressModifier = 0;
  }

  // Calculate damage
  data.damageEffort = data.damagePerLOE * data.effortDamage;
  data.totalDamage = data.damage + data.damageEffort;

  data.damageEffect = 0;
  if (data.roll.total >= 17 && !data.impairedStatus) {
    data.damageEffect = data.roll.total - 16;
  } else if (data.roll.total >= 17 && data.impairedStatus) {
    data.damageEffect = 1;
  }

  data.damageWithEffect = data.totalDamage + data.damageEffect;

  // Calculate total cost
  let firstLOECosts2Points = game.settings.get("cyphersystem", "FirstLOECosts2Points") ? 0 : 1;
  data.impaired = data.impairedStatus ? data.effortTotal : 0;
  // Legacy armor increased the cost of Speed Effort. Cypher 2026 armor does not.
  // Preserve that old surcharge only for the legacy Teen form.
  data.armorCost =
    data.teen && data.pool == "Speed"
      ? data.effortTotal * Number(actor.system.teen?.combat?.armor?.speedCostTotal ?? 0)
      : 0;
  data.costCalculated =
    data.effortTotal > 0
      ? data.effortTotal * 2 + firstLOECosts2Points + data.poolPointCost + data.armorCost + data.impaired
      : data.poolPointCost;

  // Pay pool points
  let payPoolPointsInfo = [];
  if (!data.reroll || data.pool == "Pool") {
    payPoolPointsInfo = await payPoolPoints(actor, data.costCalculated, data.pool, data.teen);
  } else if (data.reroll) {
    let edge = actor.system.pools[data.pool.toLowerCase()].edge;
    payPoolPointsInfo = [true, Math.max(0, data.costCalculated - edge), edge];
  }
  data.costTotal = Number(payPoolPointsInfo[1] ?? 0);
  data.edge = payPoolPointsInfo[2];

  // Cypher 2026 natural 20: the action's stat-Pool cost becomes 0.
  // Preserve the actual post-Edge amount paid so rerolls can transition the
  // same action between paid and refunded states without double-refunding.
  if (!data.reroll || data.actionCostPaid === undefined || data.actionCostPaid === null) {
    data.actionCostPaid = data.costTotal;
    data.natural20Refunded = false;
  } else {
    data.actionCostPaid = Math.max(0, Number(data.actionCostPaid) || 0);
    data.costTotal = data.actionCostPaid;
  }

  const natural20Transition = getNatural20CostTransition({
    teen: data.teen,
    pool: data.pool,
    rollTotal: data.roll.total,
    costPaid: data.actionCostPaid,
    wasRefunded: data.natural20Refunded,
    reroll: data.reroll
  });

  if (natural20Transition.poolDelta !== 0) {
    const adjusted = await adjustPoolPointsExact(
      actor,
      natural20Transition.poolDelta,
      data.pool,
      data.teen
    );
    if (!adjusted) return null;
  }

  data.natural20Refunded = natural20Transition.refunded;
  data.natural20RefundAmount = natural20Transition.refundAmount;
  data.finalCostTotal = natural20Transition.finalCost;

  // Calculate roll modifiers
  let difficultyModifier =
    data.easedOrHindered == "hindered" ? data.difficultyModifier * -1 : data.difficultyModifier;
  data.difficultyModifierTotal =
    data.skillLevel +
    data.assets +
    data.effortToEase +
    difficultyModifier +
    data.armorModifier -
    data.stressModifier -
    data.woundHindrance;

  // Calculate rollTotal
  data.rollTotal = data.roll.total + data.bonus + data.advantage;

  // Calculate difficulty
  data.difficulty =
    data.rollTotal < 0 ? Math.ceil(data.rollTotal / 3) : Math.floor(data.rollTotal / 3);
  data.difficultyResult = determineDifficultyResult(
    data.baseDifficulty,
    data.difficulty,
    data.difficultyModifierTotal
  );
  data.finalDifficulty = useEffectiveDifficulty(data.baseDifficulty)
    ? data.baseDifficulty
    : Math.max(data.baseDifficulty - data.difficultyModifierTotal, 0);
  data.rollSucceeded = data.baseDifficulty >= 0
    ? (useEffectiveDifficulty(data.baseDifficulty)
      ? Math.max(data.difficulty + data.difficultyModifierTotal, 0) >= data.baseDifficulty
      : data.difficulty >= data.finalDifficulty)
    : null;

  // Go to next step
  if (payPoolPointsInfo[0]) {
    await rollEngineOutput(data);
    return data;
  } else if (!payPoolPointsInfo[0] && !data.skipDialog) {
    await rollEngineForm(data);
  }
  return null;
}

function determineDifficultyResult(baseDifficulty, difficulty, difficultyModifierTotal) {
  if (useEffectiveDifficulty(baseDifficulty)) {
    let operator = difficultyModifierTotal < 0 ? "-" : "+";
    let effectiveDifficulty = difficulty + difficultyModifierTotal;
    if (effectiveDifficulty < 0) effectiveDifficulty = 0;
    return (
      effectiveDifficulty + " [" + difficulty + operator + Math.abs(difficultyModifierTotal) + "]"
    );
  } else {
    if (difficulty < 0) difficulty = 0;
    return difficulty + " (" + difficulty * 3 + ")";
  }
}
