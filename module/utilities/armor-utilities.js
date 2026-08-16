const ARMOR_STEPS = Object.freeze({
  "light armor": 1,
  "medium armor": 2,
  "heavy armor": 3,
  light: 1,
  medium: 2,
  heavy: 3
});

function normalizeArmorType(value) {
  return String(value ?? "").trim().toLowerCase();
}

function titleCase(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

export function getArmorSteps(type) {
  return ARMOR_STEPS[normalizeArmorType(type)] ?? 0;
}

export function getActiveArmorProfile(actor) {
  const armor = Array.from(actor?.items ?? [])
    .filter(item => item?.type === "armor")
    .filter(item => item.system?.active)
    .filter(item => !item.system?.archived)
    .filter(item => item.system?.settings?.general?.unmaskedForm !== "Teen")
    .map(item => {
      const type = item.system?.basic?.type ?? "";
      return {
        itemId: item.id ?? null,
        name: item.name ?? "Armor",
        type,
        typeLabel: titleCase(type || "Armor"),
        steps: getArmorSteps(type),
        freelyUse: Boolean(item.system?.basic?.freelyUse)
      };
    })
    .filter(entry => entry.steps > 0)
    .sort((a, b) => b.steps - a.steps || String(a.name).localeCompare(String(b.name)));

  return armor[0] ?? {
    itemId: null,
    name: "",
    type: "",
    typeLabel: "",
    steps: 0,
    freelyUse: false
  };
}

/**
 * Return the signed Cypher 2026 difficulty modifier caused by worn armor.
 * Positive values ease the task; negative values hinder it.
 *
 * Block always gains the armor benefit.
 * Dodge always suffers the armor penalty.
 * Other Speed tasks suffer the same penalty only when the armor is not freely used.
 */
export function getArmorRollModifier(actor, {pool = "Pool", armorTask = "normal"} = {}) {
  const profile = getActiveArmorProfile(actor);
  const task = ["block", "dodge"].includes(armorTask) ? armorTask : "normal";

  let modifier = 0;
  let reason = "";

  if (profile.steps > 0) {
    if (task === "block") {
      modifier = profile.steps;
      reason = "block";
    } else if (task === "dodge") {
      modifier = profile.steps * -1;
      reason = "dodge";
    } else if (pool === "Speed" && !profile.freelyUse) {
      modifier = profile.steps * -1;
      reason = "speed";
    }
  }

  return {...profile, task, modifier, reason};
}
