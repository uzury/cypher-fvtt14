import {executeMacroAsGM} from "../../macros/macros-scripting.js";
import {
  addCharacterToCombatTracker,
  setInitiativeForCharacter
} from "../actor-utilities.js";
import {htmlEscape} from "../html-escape.js";
import {resetDifficulty, useEffectiveDifficulty} from "./roll-engine-main.js";

export async function rollEngineOutput(data) {
  let actor = fromUuidSync(data.actorUuid);
  let teen = actor.system.basic.unmaskedForm == "Teen" ? true : false;

  // Get show details setting
  let showDetails = game.settings.get("cyphersystem", "showRollDetails");

  // Title and description
  let title = (data.title) ? `<b>` + data.title + `</b><br>` : `<b>` + game.i18n.localize("CYPHERSYSTEM.StatRoll") + `</b>`;
  let itemDescription = "";
  let itemDescriptionInfo = "";
  if (actor.items.get(data.itemID)) {
    let item = actor.items.get(data.itemID);

    itemDescription = (item.system.description) ? `<img class="description-image-chat" src="${item.img}" width="50" height="50"/>` + await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {async: true, relativeTo: item}) : `<img class="description-image-chat" src="${item.img}" width="50" height="50"/>`;

    let styleDescriptionHidden = `<div style="display: none" class="chat-card-item-description">`;
    let styleDescriptionShow = `<div class="chat-card-item-description expanded">`;
    let styleDescription = (game.settings.get("cyphersystem", "alwaysShowDescriptionOnRoll")) ? styleDescriptionShow : styleDescriptionHidden;

    itemDescriptionInfo = styleDescription + `<div style="min-height: 50px">` + itemDescription + `</div></div>`;

    title = `<a class="chat-description"><b>` + title + `</a></b>`;
  }

  // --- Difficulty block

  // Base difficulty
  let baseDifficultyInfo = (useEffectiveDifficulty(data.baseDifficulty) == false && data.baseDifficulty >= 0) ? game.i18n.localize("CYPHERSYSTEM.BaseDifficulty") + ": " + data.baseDifficulty + "<br>" : "";

  // Steps eased/hindered
  let modifiedBy = "";
  if (data.difficultyModifierTotal != 0) {
    if (data.difficultyModifierTotal > 1) {
      modifiedBy = game.i18n.format("CYPHERSYSTEM.EasedBySteps", {amount: data.difficultyModifierTotal});
    } else if (data.difficultyModifierTotal == 1) {
      modifiedBy = game.i18n.localize("CYPHERSYSTEM.Eased");
    } else if (data.difficultyModifierTotal == -1) {
      modifiedBy = game.i18n.localize("CYPHERSYSTEM.Hindered");
    } else if (data.difficultyModifierTotal < -1) {
      modifiedBy = game.i18n.format("CYPHERSYSTEM.HinderedBySteps", {amount: Math.abs(data.difficultyModifierTotal)});
    }
  }

  // Final task difficulty
  let taskDifficulty = game.i18n.localize("CYPHERSYSTEM.TaskUnmodifiedChat");
  if (data.baseDifficulty >= 0 && data.finalDifficulty >= 0) {
    taskDifficulty = game.i18n.localize("CYPHERSYSTEM.Difficulty") + ": " + data.finalDifficulty + " (" + Math.max(0, data.finalDifficulty * 3) + ")";
  } else if (modifiedBy) {
    taskDifficulty = modifiedBy;
  };

  // Skill information
  const localizedExpert = game.i18n.localize("CYPHERSYSTEM.Expert");
  const expertLabel = localizedExpert === "CYPHERSYSTEM.Expert" ? "Expert" : localizedExpert;
  let skillRating = {
    "-1": `${game.i18n.localize("CYPHERSYSTEM.SkillLevel")}: ${game.i18n.localize("CYPHERSYSTEM.Inability")}<br>`,
    "0": `${game.i18n.localize("CYPHERSYSTEM.SkillLevel")}: ${game.i18n.localize("CYPHERSYSTEM.Practiced")}<br>`,
    "1": `${game.i18n.localize("CYPHERSYSTEM.SkillLevel")}: ${game.i18n.localize("CYPHERSYSTEM.Trained")}<br>`,
    "2": `${game.i18n.localize("CYPHERSYSTEM.SkillLevel")}: ${game.i18n.localize("CYPHERSYSTEM.Specialized")}<br>`,
    "3": `${game.i18n.localize("CYPHERSYSTEM.SkillLevel")}: ${expertLabel}<br>`
  };
  let skillInfo = (skillRating[data.skillLevel] || skillRating[0]);

  // Asset information
  let assetsInfo = `${game.i18n.localize("CYPHERSYSTEM.Assets")}: ${data.assets}<br>`;

  // effortToEase information
  let effortToEaseInfo = (data.effortToEase != 1) ?
    `${game.i18n.localize("CYPHERSYSTEM.Effort")}: ${data.effortToEase} ${game.i18n.localize("CYPHERSYSTEM.levels")}<br>` :
    `${game.i18n.localize("CYPHERSYSTEM.Effort")}: ${data.effortToEase} ${game.i18n.localize("CYPHERSYSTEM.level")}<br>`;

  // Cypher 2026 Wound hindrance information
  let woundHindranceInfo = "";
  const woundHindrance = Math.max(0, Number(data.woundHindrance ?? 0));
  if (woundHindrance === 1) {
    woundHindranceInfo = `Wounds: Hindered by 1 step<br>`;
  } else if (woundHindrance > 1) {
    woundHindranceInfo = `Wounds: Hindered by ${woundHindrance} steps<br>`;
  }

  // Stress information
  let stressInfo = "";

  // Cypher 2026 Armor information
  let armorModifierInfo = "";
  const armorModifier = Number(data.armorModifier ?? 0);
  const armorProfile = data.armorProfile ?? {};
  const armorSteps = Math.abs(armorModifier);
  const armorStepWord = armorSteps === 1 ? "step" : "steps";
  if (armorModifier !== 0 && armorProfile.typeLabel) {
    if (armorProfile.reason === "block") {
      armorModifierInfo = `Armor: ${armorProfile.typeLabel} — Block eased by ${armorSteps} ${armorStepWord}<br>`;
    } else if (armorProfile.reason === "dodge") {
      armorModifierInfo = `Armor: ${armorProfile.typeLabel} — Dodge hindered by ${armorSteps} ${armorStepWord}<br>`;
    } else if (armorProfile.reason === "speed") {
      armorModifierInfo = `Armor: ${armorProfile.typeLabel} — Speed tasks hindered by ${armorSteps} ${armorStepWord} (not freely used)<br>`;
    }
  }

  if (actor.system.settings.combat.stress.active && data.stressModifier == 1) {
    stressInfo = `${game.i18n.localize("CYPHERSYSTEM.Stress")}: ${data.stressModifier} ${game.i18n.localize("CYPHERSYSTEM.level")}<br>`;
  } else if (actor.system.settings.combat.stress.active && data.stressModifier >= 2) {
    stressInfo = `${game.i18n.localize("CYPHERSYSTEM.Stress")}: ${data.stressModifier} ${game.i18n.localize("CYPHERSYSTEM.levels")}<br>`;
  }

  // Additional step(s) information
  let difficultyInfo = "";
  if (data.easedOrHindered == "eased") {
    if (data.difficultyModifier > 1) {
      difficultyInfo = `${game.i18n.format("CYPHERSYSTEM.EasedByExtraSteps", {amount: data.difficultyModifier})}<br>`;
    } else if (data.difficultyModifier == 1) {
      difficultyInfo = `${game.i18n.localize("CYPHERSYSTEM.EasedByExtraStep")}<br>`;
    } else if (data.difficultyModifier < -1) {
      difficultyInfo = `${game.i18n.format("CYPHERSYSTEM.HinderedByExtraSteps", {amount: Math.abs(data.difficultyModifier)})}<br>`;
    } else if (data.difficultyModifier == -1) {
      difficultyInfo = `${game.i18n.localize("CYPHERSYSTEM.HinderedByExtraStep")}<br>`;
    }
  } else if (data.easedOrHindered == "hindered") {
    if (data.difficultyModifier < -1) {
      difficultyInfo = `${game.i18n.format("CYPHERSYSTEM.EasedByExtraSteps", {amount: data.difficultyModifier})}<br>`;
    } else if (data.difficultyModifier == -1) {
      difficultyInfo = `${game.i18n.localize("CYPHERSYSTEM.EasedByExtraStep")}<br>`;
    } else if (data.difficultyModifier > 1) {
      difficultyInfo = `${game.i18n.format("CYPHERSYSTEM.HinderedByExtraSteps", {amount: Math.abs(data.difficultyModifier)})}<br>`;
    } else if (data.difficultyModifier == 1) {
      difficultyInfo = `${game.i18n.localize("CYPHERSYSTEM.HinderedByExtraStep")}<br>`;
    }
  }

  // Details style
  let styleDifficultyDetailsHidden = `<div class="roll-result-difficulty-details" style="display: none">`;
  let styleDifficultyDetailsExpanded = `<div class="roll-result-difficulty-details expanded">`;
  let styleDifficultyDetails = (showDetails) ? styleDifficultyDetailsExpanded : styleDifficultyDetailsHidden;

  let difficultyDetailsInfo = styleDifficultyDetails + baseDifficultyInfo + skillInfo + assetsInfo + effortToEaseInfo + woundHindranceInfo + armorModifierInfo + stressInfo + difficultyInfo + `</div>`;

  // Create block
  let difficultyBlock = `<div class="roll-result-box"><b><a class="roll-result-difficulty">` + taskDifficulty + `</a></b><br>` + difficultyDetailsInfo + `</div>`;

  if (data.skipRoll || taskDifficulty == "") {
    difficultyBlock = "";
  }

  // --- Damage block

  // Base damage
  let baseDamageInfo = (data.damage == 1) ?
    game.i18n.format("CYPHERSYSTEM.BaseDamagePoint", {baseDamage: data.damage}) + "<br>" :
    game.i18n.format("CYPHERSYSTEM.BaseDamagePoints", {baseDamage: data.damage}) + "<br>";

  // Effect damage
  let effectDamageInfo = (data.damageEffect == 1) ?
    game.i18n.format("CYPHERSYSTEM.EffectDamagePoint", {baseDamage: data.damageEffect}) + "<br>" :
    game.i18n.format("CYPHERSYSTEM.EffectDamagePoints", {baseDamage: data.damageEffect}) + "<br>";

  // Damage information
  let damageInfo = "";
  if (data.totalDamage == 1 && data.damageEffect == 0) {
    damageInfo = game.i18n.format("CYPHERSYSTEM.DamageInflictedPoint", {totalDamage: data.totalDamage});
  } else if (data.totalDamage >= 2 && data.damageEffect == 0) {
    damageInfo = game.i18n.format("CYPHERSYSTEM.DamageInflictedPoints", {totalDamage: data.totalDamage});
  } else if (data.totalDamage > 0 && data.damageEffect >= 1 && data.damageEffect <= 2) {
    damageInfo = game.i18n.format("CYPHERSYSTEM.DamageInflictedPoints", {totalDamage: data.damageWithEffect});
  } else if (data.totalDamage > 0 && data.damageEffect >= 3) {
    damageInfo = game.i18n.format("CYPHERSYSTEM.DamageWithEffectInfo", {totalDamage: data.totalDamage, damageWithEffect: data.damageWithEffect});
  }

  // Effort information
  let effortDamageInfo = "";
  if (data.damageEffort == 1) {
    effortDamageInfo = `${game.i18n.localize("CYPHERSYSTEM.Effort")}: ${data.damageEffort} ${game.i18n.localize("CYPHERSYSTEM.point")}<br>`;
  } else {
    effortDamageInfo = `${game.i18n.localize("CYPHERSYSTEM.Effort")}: ${data.damageEffort} ${game.i18n.localize("CYPHERSYSTEM.points")}<br>`;
  }

  // Details style
  let styleDamageDetailsHidden = `<div class="roll-result-damage-details" style="display: none">`;
  let styleDamageDetailsExpanded = `<div class="roll-result-damage-details expanded">`;
  let styleDamageDetails = (showDetails) ? styleDamageDetailsExpanded : styleDamageDetailsHidden;

  let damageDetailsInfo = styleDamageDetails + baseDamageInfo + effectDamageInfo + effortDamageInfo + `</div>`;

  // Create block
  let damageInfoBlock = "";
  if (damageInfo != "") {
    damageInfoBlock = `<div class="roll-result-box"><b><a class="roll-result-damage">` + damageInfo + `</a></b><br>` + damageDetailsInfo + `</div>`;
  }

  // --- Cost info block

  // Cost information
  let poolCostInfo = {
    "Might": function () {
      return (data.poolPointCost != 1) ?
        `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost} ${game.i18n.localize("CYPHERSYSTEM.points")}` :
        `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost} ${game.i18n.localize("CYPHERSYSTEM.point")}`;
    },
    "Speed": function () {
      return (data.poolPointCost != 1) ?
        `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost} ${game.i18n.localize("CYPHERSYSTEM.points")}` :
        `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost} ${game.i18n.localize("CYPHERSYSTEM.point")}`;
    },
    "Intellect": function () {
      return (data.poolPointCost != 1) ?
        `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost} ${game.i18n.localize("CYPHERSYSTEM.points")}` :
        `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost} ${game.i18n.localize("CYPHERSYSTEM.point")}`;
    },
    "Pool": function () {
      return (data.poolPointCost != 1) ?
        `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost} ${game.i18n.localize("CYPHERSYSTEM.points")}` :
        `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost} ${game.i18n.localize("CYPHERSYSTEM.point")}`;
    },
    "XP": function () {
      return `${game.i18n.localize("CYPHERSYSTEM.BaseCost")}: ${data.poolPointCost}  ${game.i18n.localize("CYPHERSYSTEM.XP")}`;
    }
  };

  const displayedCostTotal = Math.max(0, Number(data.finalCostTotal ?? data.costTotal ?? 0));

  let costTotalInfo = {
    "Might": function () {
      return (displayedCostTotal != 1) ?
        `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.MightPoints")}` :
        `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.MightPoint")}`;
    },
    "Speed": function () {
      return (displayedCostTotal != 1) ?
        `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.SpeedPoints")}` :
        `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.SpeedPoint")}`;
    },
    "Intellect": function () {
      return (displayedCostTotal != 1) ?
        `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.IntellectPoints")}` :
        `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.IntellectPoint")}`;
    },
    "Pool": function () {
      return (displayedCostTotal != 1) ?
        `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.AnyPoolPoints")}` :
        `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.AnyPoolPoint")}`;
    },
    "XP": function () {
      return `${game.i18n.localize("CYPHERSYSTEM.Cost")}: ${displayedCostTotal} ${game.i18n.localize("CYPHERSYSTEM.XP")}`;
    }
  };

  // Effort info
  let effortCost = data.costCalculated - data.poolPointCost;
  let effortInfo = (data.costCalculated == 1) ?
    `${game.i18n.localize("CYPHERSYSTEM.Effort")}: ${effortCost} ${game.i18n.localize("CYPHERSYSTEM.point")}<br>` :
    `${game.i18n.localize("CYPHERSYSTEM.Effort")}: ${effortCost} ${game.i18n.localize("CYPHERSYSTEM.points")}<br>`;

  // Edge info
  let edgeInfo = `${game.i18n.localize("CYPHERSYSTEM.Edge")}: ${data.edge}`;

  // Details style
  let styleCostDetailsHidden = `<div class="roll-result-cost-details" style="display: none">`;
  let styleCostDetailsExpanded = `<div class="roll-result-cost-details expanded">`;
  let styleCostDetails = (showDetails) ? styleCostDetailsExpanded : styleCostDetailsHidden;

  let poolCostInfoString = poolCostInfo[data.pool]() + "<br>";
  let costTotalInfoString = costTotalInfo[data.pool]();

  const natural20RefundAmount = Math.max(0, Number(data.natural20RefundAmount ?? 0));
  const natural20RefundInfo = data.natural20Refunded && natural20RefundAmount > 0
    ? `<br>${game.i18n.localize("CYPHERSYSTEM.RegainPoints")}: ${natural20RefundAmount}`
    : "";

  let costDetailsInfo = styleCostDetails + poolCostInfoString + effortInfo + edgeInfo + natural20RefundInfo + `</div>`;

  let costInfoBlock = "";
  if (data.poolPointCost != 0 || data.costCalculated != 0) {
    costInfoBlock = `<div class="roll-result-box"><b><a class="roll-result-cost">` + costTotalInfoString + `</a></b>` + costDetailsInfo + `</div>`;
  }

  // --- Roll result block

  // Determine result with bonus/penalty
  let advantageInfo = (data.advantage > 0) ? " + 3" : "";
  let operator = (data.bonus < 0) ? "-" : "+";
  let bonusInfo = (data.bonus != 0 && data.bonus != "") ? " " + operator + " " + Math.abs(data.bonus) : "";
  let resultInfo = (bonusInfo || advantageInfo) ? "<span class='roll-result'>" + game.i18n.localize("CYPHERSYSTEM.Result") + ": " + data.rollTotal + " [" + data.roll.total + bonusInfo + advantageInfo + "]" + "</span><br>" : "";

  // Determine special effect
  let effect = "";
  let boxColor = "";

  if (data.roll.total == 17 && !data.impairedStatus && data.totalDamage >= 1) {
    effect = "<br><span class='roll-effect effect1718'>" + game.i18n.localize("CYPHERSYSTEM.OneDamage") + "</span>";
    boxColor = "box1718";
  } else if (data.roll.total == 18 && !data.impairedStatus && data.totalDamage >= 1) {
    effect = "<br><span class='roll-effect effect1718'>" + game.i18n.localize("CYPHERSYSTEM.TwoDamage") + "</span>";
    boxColor = "box1718";
  } else if (data.roll.total == 19 && !data.impairedStatus && data.totalDamage >= 1) {
    effect = "<br><span class='roll-effect effect1920'>" + game.i18n.localize("CYPHERSYSTEM.DamageOrMinorEffectRoll") + "</span>";
    boxColor = "box1920";
  } else if (data.roll.total == 19 && !data.impairedStatus && data.totalDamage <= 0) {
    effect = "<br><span class='roll-effect effect1920'>" + game.i18n.localize("CYPHERSYSTEM.MinorEffectRoll") + "</span>";
    boxColor = "box1920";
  } else if (data.roll.total == 20 && !data.impairedStatus && data.totalDamage >= 1) {
    effect = "<br><span class='roll-effect effect1920'>" + game.i18n.localize("CYPHERSYSTEM.DamageOrMajorEffectRoll") + "</span>";
    boxColor = "box1920";
  } else if (data.roll.total == 20 && !data.impairedStatus && data.totalDamage <= 0) {
    effect = "<br><span class='roll-effect effect1920'>" + game.i18n.localize("CYPHERSYSTEM.MajorEffectRoll") + "</span>";
    boxColor = "box1920";
  } else if ([17, 18, 19, 20].includes(data.roll.total) && data.impairedStatus && data.totalDamage >= 1) {
    effect = "<br><span class='roll-effect effect1718'>" + game.i18n.localize("CYPHERSYSTEM.OneDamage") + "</span>";
    boxColor = "box1718";
  } else if (data.roll.total == 1) {
    boxColor = "box1";
  }

  let gmiEffect = "";
  if (data.roll.total <= data.gmiRange) {
    gmiEffect = "<br><span class='roll-effect intrusion'>" + game.i18n.localize("CYPHERSYSTEM.GMIntrusion") + "</span>";
    boxColor = "box1";
  }

  // Create multi roll
  let multiRollInfo = (actor.getFlag("cyphersystem", "multiRoll.active")) ? "<div class='multi-roll-active'>" + game.i18n.localize("CYPHERSYSTEM.MultiRoll") + "</div>" : "";

  // Create reroll info
  let rerollInfo = "";

  if (data.reroll) {
    if (data.advantage) {
      rerollInfo = "<div>" + game.i18n.localize("CYPHERSYSTEM.RerollWithAdvantage") + "</div>";
    } else {
      rerollInfo = "<div>" + game.i18n.localize("CYPHERSYSTEM.Reroll") + "</div>";
    }
  }

  // Create beatenDifficulty
  let beatenDifficulty = "<span class='roll-difficulty'>" + game.i18n.localize("CYPHERSYSTEM.RollBeatDifficulty") + " " + data.difficultyResult + "</span>";

  // Add initiative result
  let initiativeResult = data.roll.total + (data.difficultyModifierTotal * 3) + data.bonus;
  let initiativeInfo = (data.initiativeRoll) ? "<br><span class='roll-initiative'>" + game.i18n.localize("CYPHERSYSTEM.Initiative") + ": " + initiativeResult + "</span > " : "";

  // Create success info
  let successInfo = "";
  if (data.baseDifficulty >= 0) {
    let difficultyBeaten = (useEffectiveDifficulty(data.baseDifficulty)) ? data.difficulty + data.difficultyModifierTotal : data.difficulty;
    successInfo = (difficultyBeaten >= data.finalDifficulty) ? "<br><span class='roll-effect effect1920'>" + game.i18n.localize("CYPHERSYSTEM.Success") + "</span>" : "<br><span class='roll-effect intrusion'>" + game.i18n.localize("CYPHERSYSTEM.Failure") + "</span>";
  };

  // Create info block
  let info = difficultyBlock + costInfoBlock + damageInfoBlock;

  // Add reroll button
  let actorUuid = (actor) ? actor.uuid : "";
  data.baseDifficulty = (data.baseDifficulty >= 0) ? parseInt(data.baseDifficulty) : data.baseDifficulty;
  let dataString = htmlEscape(JSON.stringify(data));
  let reRollButton = ` <a class='reroll-stat' title='${game.i18n.localize("CYPHERSYSTEM.RerollHint")}' data-user='${game.user.id}' data-data='${dataString}'><i class="fa-item fas fa-dice-d20"></i></a>`;

  // Add regain points button
  let regainPointsButton = "";
  if (data.teen && data.costTotal > 0 && data.roll.total == 20 && ["Might", "Speed", "Intellect"].includes(data.pool)) {
    regainPointsButton = `<a class='regain-points' title='${game.i18n.localize("CYPHERSYSTEM.RegainPoints")}' data-user='${game.user.id}' data-actor-uuid='${actorUuid}' data-cost='${data.costTotal}' data-pool='${data.pool}' data-teen='${data.teen}'><i class="fa-item fas fa-coins"></i></a>`;
  }

  // Put buttons together
  let chatButtons = `<div class="chat-card-buttons" data-actor-uuid="${actorUuid}">` + regainPointsButton + reRollButton + `</div>`;

  // HR if info
  let infoHR = (info) ? "<hr class='roll-result-hr'>" : "";

  // Cypher 2026 roll card
  const isCoreStatRoll =
    !data.itemID &&
    ["Might", "Speed", "Intellect"].includes(data.pool);

  const statRollDisplayName = {
    Might: "Might",
    Speed: "Speed",
    Intellect: "Intelligence"
  }[data.pool] ?? data.pool;

  const cardTitleText = data.title || game.i18n.localize("CYPHERSYSTEM.StatRoll");
  const titleSeparatorIndex = cardTitleText.indexOf(":");

  const cardCategoryText = isCoreStatRoll
    ? game.i18n.localize("CYPHERSYSTEM.StatRoll")
    : titleSeparatorIndex >= 0
      ? cardTitleText.slice(0, titleSeparatorIndex).trim()
      : "";

  const cardNameText = isCoreStatRoll
    ? statRollDisplayName
    : titleSeparatorIndex >= 0
      ? cardTitleText.slice(titleSeparatorIndex + 1).trim()
      : cardTitleText.trim();

  const cardTitleContent = `
    ${cardCategoryText ? `<span class="cypher-roll-title-category">${htmlEscape(cardCategoryText)}</span>` : ""}
    <span class="cypher-roll-title-name">${htmlEscape(cardNameText)}</span>
  `;

  const item = actor.items.get(data.itemID) ?? null;
  const cardTitle = item
    ? `<a class="chat-description cypher-roll-title-link">${cardTitleContent}</a>`
    : `<div class="cypher-roll-title-static">${cardTitleContent}</div>`;

  const actorName = htmlEscape(actor.name ?? "Character");
  const actorAvatar = htmlEscape(actor.img ?? "icons/svg/mystery-man.svg");
  const playerName = htmlEscape(game.user?.name ?? "Player");
  const itemIcon = item?.img ? htmlEscape(item.img) : "";
  const itemIconAlt = item?.name ? htmlEscape(item.name) : "Roll source";
  const rollFormulaEscaped = htmlEscape(data.roll.formula);

  const difficultyBeatenForStyle = useEffectiveDifficulty(data.baseDifficulty)
    ? data.difficulty + data.difficultyModifierTotal
    : data.difficulty;

  const computedRollTotal = Number.isFinite(Number(data.rollTotal))
    ? Number(data.rollTotal)
    : Number(data.roll?.total ?? 0);

  const hasDifficulty = data.baseDifficulty >= 0;
  const beatenDifficultyValue = hasDifficulty
    ? Math.max(0, difficultyBeatenForStyle)
    : Math.max(0, Math.floor(computedRollTotal / 3));

  const isGmIntrusion = data.roll.total <= data.gmiRange;
  const isCritical20 = !isGmIntrusion && data.roll.total === 20;
  const isCritical1719 = !isGmIntrusion && [17, 18, 19].includes(data.roll.total);

  const isSuccess = hasDifficulty
    ? difficultyBeatenForStyle >= data.finalDifficulty
    : isCritical20;

  let resultStateClass = "cypher-roll-neutral";
  let rollStatusText = "";

  if (isGmIntrusion) {
    resultStateClass = "cypher-roll-intrusion";
    rollStatusText = "GM Intrusion!";
  } else if (!hasDifficulty) {
    if (isCritical20) {
      resultStateClass = "cypher-roll-critical20";
      rollStatusText = "Critical Success!";
    } else {
      resultStateClass = "cypher-roll-neutral";
      rollStatusText = "";
    }
  } else if (!isSuccess) {
    resultStateClass = "cypher-roll-failure";
    rollStatusText = "Failure!";
  } else if (isCritical20) {
    resultStateClass = "cypher-roll-critical20";
    rollStatusText = "Critical Success!";
  } else if (isCritical1719) {
    resultStateClass = "cypher-roll-critical";
    rollStatusText = "Success!";
  } else {
    resultStateClass = "cypher-roll-success";
    rollStatusText = "Success!";
  }

  const statusMarkup = rollStatusText
    ? `
      <div class="cypher-roll-status">
        ${htmlEscape(rollStatusText)}
      </div>
    `
    : "";

  const infoBlock = info
    ? `<div class="cypher-roll-info">${info}</div>`
    : "";

  const difficultyLine = `
    <div class="cypher-roll-difficulty">
      <span class="cypher-roll-difficulty-label">${game.i18n.localize("CYPHERSYSTEM.RollBeatDifficulty")}</span>
      <span class="cypher-roll-difficulty-value">${beatenDifficultyValue}</span>
    </div>
  `;

  const itemIconMarkup = itemIcon
    ? `
      <div class="cypher-roll-source-icon-wrap">
        <img
          class="cypher-roll-source-icon"
          src="${itemIcon}"
          alt="${itemIconAlt}"
          title="${itemIconAlt}"
        >
      </div>
    `
    : "";

  // Put it all together into the chat flavor.
  // The real Foundry Roll remains attached to the ChatMessage below.
  let flavor = `
    <div class="roll-flavor cypher-roll-card ${resultStateClass}">
      <div class="cypher-roll-identity">
        <div class="cypher-roll-identity-left">
          <img
            class="cypher-roll-avatar"
            src="${actorAvatar}"
            alt="${actorName}"
          >
          <div class="cypher-roll-identity-text">
            <span class="cypher-roll-character-name">${actorName}</span>
            <span class="cypher-roll-player-name">(${playerName})</span>
          </div>
        </div>

        ${itemIconMarkup}
      </div>

      <div class="cypher-roll-hero ${boxColor}">
        <div class="cypher-roll-die-column">
          <div class="cypher-roll-die" title="${rollFormulaEscaped}">
            <i class="fas fa-dice-d20 cypher-roll-die-icon" aria-hidden="true"></i>
            <span class="cypher-roll-natural${data.roll.total === 4 ? " cypher-roll-natural-4" : ""}">${data.roll.total}</span>
          </div>

          ${statusMarkup}
        </div>

        <div class="cypher-roll-summary">
          <div class="cypher-roll-title">
            ${cardTitle}
            ${rerollInfo}
            ${multiRollInfo}
          </div>

          <div class="cypher-roll-divider"></div>

          ${difficultyLine}

          <div class="cypher-roll-formula-inline">
            ${rollFormulaEscaped}
          </div>

          <div class="cypher-roll-outcome">
            ${initiativeInfo}
            ${effect}
          </div>
        </div>
      </div>

      ${itemDescriptionInfo}
      ${infoBlock}
      ${chatButtons}
    </div>`;

  if (data.skipRoll) {
    ChatMessage.create({
      content: "<div class='roll-flavor'><div class='roll-result-box'>" + title + itemDescriptionInfo + "</div>" + infoHR + info + "</div>",
      speaker: ChatMessage.getSpeaker({actor: actor}),
      flags: {
        "itemID": data.itemID,
        "data": data
      }
    });
  } else if (!data.skipRoll) {
    // Create chat message
    var rollMessage = await data.roll.toMessage({
      speaker: ChatMessage.getSpeaker({actor: actor}),
      flavor: flavor,
      flags: {
        "itemID": data.itemID,
        "data": data
      }
    });

    // Handle initiative
    if (data.initiativeRoll) {
      await addCharacterToCombatTracker(actor);
      await setInitiativeForCharacter(actor, initiativeResult);
    }
  }

  // Reset difficulty
  if (game.settings.get("cyphersystem", "persistentRollDifficulty") == 0) {
    if (game.user.isGM) {
      await resetDifficulty();
    } else {
      await game.socket.emit("system.cyphersystem", {operation: "resetDifficulty"});
    }
  }

  // statRoll hook
  Hooks.call("rollEngine", actor, data);

  // Execute macro
  if (data.macroUuid) {
    // Check for macro
    let macro = await fromUuid(data.macroUuid);
    if (!macro) return ui.notifications.warn(game.i18n.localize("CYPHERSYSTEM.MacroNotFound"));

    // Wait for Dice So Nice animation
    if (rollMessage) {
      await game.dice3d?.waitFor3DAnimationByMessageID(rollMessage.id);
    }

    // Get and pass targets
    let targetArray = Array.from(game.user.targets);
    let targetIDs = [];

    for (let target in targetArray) {
      targetIDs.push(targetArray[target].id);
    }

    data.targetIDs = targetIDs;

    // Execute macro
    if (data.macroExecuteAsGM && !game.user.isGM) {
      await game.socket.emit('system.cyphersystem', {operation: 'executeMacroAsGM', macroUuid: data.macroUuid, rollData: data});
    } else {
      await macro.execute({"rollData": data});
    }
  }
}
