const {HandlebarsApplicationMixin} = foundry.applications.api;
const {ActorSheetV2} = foundry.applications.sheets;
import {rollEngineMain} from "../../utilities/roll-engine/roll-engine-main.js";
import {sendRecoveryRollCard, itemRollMacro, diceRollMacro} from "../../macros/macros.js";
import {
  applyPoolDamage,
  applyWound,
  getSuggestedTreatmentTime,
  getTreatmentDifficulty,
  getWoundHindrance,
  getWoundState,
  rallyWound,
  removeWound
} from "../../utilities/wound-utilities.js";
import {
  applyC2Recovery,
  getC2RecoveryFormula,
  getC2RecoveryOptions,
  getC2RecoveryPoolState
} from "../../utilities/recovery-utilities.js";
import {getArmorSteps} from "../../utilities/armor-utilities.js";
// Cypher PC V2 - shared embedded Item card helpers
function escapeItemCardText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAbilityDisplayData(item) {
  const rawCost = String(item.system.basic?.cost ?? "").trim();
  const hasCost = rawCost !== "" && rawCost !== "0";
  const pool = item.system.basic?.pool ?? "Pool";
  const poolLabels = {
    Might: game.i18n.localize("CYPHERSYSTEM.Might"),
    Speed: game.i18n.localize("CYPHERSYSTEM.Speed"),
    Intellect: game.i18n.localize("CYPHERSYSTEM.Intellect"),
    Pool: game.i18n.localize("CYPHERSYSTEM.AnyPool"),
    XP: game.i18n.localize("CYPHERSYSTEM.XP")
  };
  const poolLabel = poolLabels[pool] ?? String(pool);
  const category = item.system.settings?.general?.sorting ?? "Ability";
  const isSpell = category === "Spell";
  const spellPowerLabels = {
    low: game.i18n.localize("CYPHERSYSTEM.AbilitiesV2LowPower"),
    mid: game.i18n.localize("CYPHERSYSTEM.AbilitiesV2MediumPower"),
    high: game.i18n.localize("CYPHERSYSTEM.AbilitiesV2AdvancedPower")
  };
  const spellPower = item.system.settings?.general?.spellTier ?? "low";
  const spellPowerLabel = isSpell
    ? spellPowerLabels[spellPower] ?? spellPowerLabels.low
    : "";
  const costLabel = hasCost
    ? `${rawCost} ${poolLabel}`
    : game.i18n.localize("CYPHERSYSTEM.AbilitiesV2NoCost");
  const costMetaLabel = hasCost
    ? `${game.i18n.localize("CYPHERSYSTEM.PointCost")}: ${costLabel}`
    : costLabel;

  return {
    category,
    costLabel,
    costMetaLabel,
    hasCost,
    spellPowerLabel
  };
}

async function buildItemCard(actor, item, {meta = ""} = {}) {
  const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    item.system.description ?? "",
    {
      async: true,
      relativeTo: item
    }
  );

  const actorName = escapeItemCardText(actor?.name ?? "Character");
  const actorAvatar = escapeItemCardText(actor?.img ?? "icons/svg/mystery-man.svg");
  const playerName = escapeItemCardText(game.user?.name ?? "Player");
  const itemName = escapeItemCardText(item?.name ?? "Item");
  const localizedItemType = game.i18n.localize(`TYPES.Item.${item?.type}`);
  const itemType = escapeItemCardText(
    item?.system?.basic?.type || localizedItemType || item?.type || "Item"
  );
  const itemImage = escapeItemCardText(item?.img ?? "icons/svg/item-bag.svg");
  const itemMeta = escapeItemCardText(meta);

  return `
    <div class="cypher-item-card">
      <div class="cypher-item-identity">
        <div class="cypher-item-identity-left">
          <img class="cypher-item-avatar" src="${actorAvatar}" alt="${actorName}">
          <div class="cypher-item-identity-text">
            <span class="cypher-item-character-name">${actorName}</span>
            <span class="cypher-item-player-name">(${playerName})</span>
          </div>
        </div>
        <img class="cypher-item-source-image" src="${itemImage}" alt="${itemName}">
      </div>

      <div class="cypher-item-heading">
        <div class="cypher-item-heading-text">
          <div class="cypher-item-type">${itemType}</div>
          <div class="cypher-item-name">${itemName}</div>
          ${itemMeta ? `<div class="cypher-item-meta">${itemMeta}</div>` : ""}
        </div>
      </div>

      <div class="cypher-item-divider"></div>
      <div class="cypher-item-body">${description}</div>
    </div>`;
}

export class CypherActorSheetPCV2 extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["cyphersystem", "cypher-pc-v2"],
    actions: {
      rollPool: this._rollPool,
      rollDiceTray: this._rollDiceTray,
      changeTab: this._changeTab,
      recoveryRoll: this._recoveryRoll,
      resetRecovery: this._resetRecovery,
      resetWoundRow: this._resetWoundRow,
      takeWound: this._takeWound,
      rallyWound: this._rallyWound,
      treatWound: this._treatWound,
      applyPoolDamage: this._applyPoolDamage,
      rollAttack: this._rollAttack,
      createCombatItem: this._createCombatItem,
      editCombatItem: this._editCombatItem,
      toggleArmor: this._toggleArmor,
      toggleArmorFreeUse: this._toggleArmorFreeUse,
      rollArmorDefense: this._rollArmorDefense,
      deleteCombatItem: this._deleteCombatItem,
      combatItemDescription: this._combatItemDescription,
      adjustCombatItemValue: this._adjustCombatItemValue,
      rollSkill: this._rollSkill,
      createSkillItem: this._createSkillItem,
      editSkillItem: this._editSkillItem,
      toggleSkillFavorite: this._toggleSkillFavorite,
      deleteSkillItem: this._deleteSkillItem,
      skillItemDescription: this._skillItemDescription,
      useAbility: this._useAbility,
      createAbilityItem: this._createAbilityItem,
      editAbilityItem: this._editAbilityItem,
      toggleAbilityFavorite: this._toggleAbilityFavorite,
      deleteAbilityItem: this._deleteAbilityItem,
      abilityItemDescription: this._abilityItemDescription
    },
    position: {width: 820, height: 760},
    window: {resizable: true},
    form: {
      closeOnSubmit: false,
      submitOnChange: true
    }
  };

  static PARTS = {
    header: {template: "systems/cyphersystem/templates/actor-sheets/v2/parts/header.hbs"},
    pools: {template: "systems/cyphersystem/templates/actor-sheets/v2/parts/pools.hbs"},
    navigation: {template: "systems/cyphersystem/templates/actor-sheets/v2/parts/navigation.hbs"},
    overview: {template: "systems/cyphersystem/templates/actor-sheets/v2/parts/overview.hbs"},
    combat: {template: "systems/cyphersystem/templates/actor-sheets/v2/parts/combat.hbs"},
    abilities: {template: "systems/cyphersystem/templates/actor-sheets/v2/parts/abilities.hbs"},
    skills: {template: "systems/cyphersystem/templates/actor-sheets/v2/parts/skills.hbs"}
  };

  get title() {
    return `${this.actor.name} - Cypher PC V2`;
  }

  /**
   * Roll one of the three core stat Pools using the existing Cypher Roll Engine.
   * @this {CypherActorSheetPCV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _rollPool(event, target) {
    event.preventDefault();

    if (!this.isEditable) return;

    const poolMap = {
      might: "Might",
      speed: "Speed",
      intellect: "Intellect"
    };

    const pool = poolMap[target.dataset.pool];
    if (!pool) return;

    await rollEngineMain({
      actorUuid: this.actor.uuid,
      pool
    });
  }

  static async _rollDiceTray(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const die = target.dataset.die;
    if (!["d6", "d10", "d20", "d100"].includes(die)) return;

    await diceRollMacro(die, this.actor);
  }

  static _changeTab(event, target) {
    event.preventDefault();

    const tab = target.dataset.tab;
    if (!["overview", "combat", "abilities", "skills"].includes(tab)) return;

    this._activeTab = tab;
    this._syncTabs();
  }

  static async _recoveryRoll(event) {
    event.preventDefault();
    if (!this.isEditable) return;

    if (this.actor.system.basic?.unmaskedForm === "Teen") {
      ui.notifications.warn("Cypher 2026 recovery automation is not enabled for the legacy Teen form.");
      return;
    }

    const displayKeys = {
      oneAction: "CYPHERSYSTEM.RecoveryAction",
      tenMinutes: "CYPHERSYSTEM.RecoveryMinutes",
      oneHour: "CYPHERSYSTEM.RecoveryHour",
      tenHours: "CYPHERSYSTEM.RecoveryHours"
    };
    const usedKeys = {
      oneAction: "CYPHERSYSTEM.RecoveryOneAction",
      tenMinutes: "CYPHERSYSTEM.RecoveryTenMinutes",
      oneHour: "CYPHERSYSTEM.RecoveryOneHour",
      tenHours: "CYPHERSYSTEM.RecoveryTenHours"
    };

    const available = getC2RecoveryOptions(this.actor).filter(option => option.remaining > 0);
    if (!available.length) {
      ui.notifications.warn(game.i18n.format("CYPHERSYSTEM.NoRecoveriesLeft", {name: this.actor.name}));
      return;
    }

    const optionMarkup = available.map(option => {
      const label = game.i18n.localize(displayKeys[option.type]);
      const suffix = option.total > 1 ? ` (${option.remaining}/${option.total} available)` : "";
      return `<option value="${option.type}">${label}${suffix}</option>`;
    }).join("");

    const selection = await foundry.applications.api.DialogV2.input({
      window: {title: "Take Recovery"},
      content: `
        <div class="form-group">
          <label>Recovery</label>
          <div class="form-fields">
            <select name="recoveryType" autofocus>${optionMarkup}</select>
          </div>
          <p class="hint">Choose which unused recovery you are completing. Cypher 2026 recoveries may be used in any order.</p>
        </div>
        <div class="form-group cypher-c2-last-action-row">
          <label>Last action</label>
          <div class="form-fields">
            <input name="lastAction" type="checkbox">
          </div>
          <p class="hint">A one-action recovery used as a Last action adds +2 to the recovery roll.</p>
        </div>`,
      ok: {label: "Roll Recovery", icon: "fa-solid fa-heart"},
      render: (_event, dialog) => {
        const select = dialog.element.querySelector('select[name="recoveryType"]');
        const checkbox = dialog.element.querySelector('input[name="lastAction"]');
        const row = dialog.element.querySelector(".cypher-c2-last-action-row");
        const sync = () => {
          const enabled = select?.value === "oneAction";
          if (checkbox) {
            checkbox.disabled = !enabled;
            if (!enabled) checkbox.checked = false;
          }
          if (row) row.style.opacity = enabled ? "1" : "0.55";
        };
        select?.addEventListener("change", sync);
        sync();
      },
      rejectClose: false,
      modal: true
    });
    if (!selection) return;

    const recoveryType = String(selection.recoveryType ?? "");
    if (!available.some(option => option.type === recoveryType)) return;

    const lastAction = recoveryType === "oneAction" && Boolean(selection.lastAction);
    const formula = getC2RecoveryFormula(this.actor, {lastAction});
    const roll = await new Roll(formula).evaluate();
    const recoveredPoints = Math.max(0, Math.trunc(Number(roll.total ?? 0)));
    const poolState = getC2RecoveryPoolState(this.actor);

    const wounds = this.actor.system.combat?.wounds ?? {};
    const minor = Math.max(0, Math.trunc(Number(wounds.minor?.value ?? 0)));
    const moderate = Math.max(0, Math.trunc(Number(wounds.moderate?.value ?? 0)));
    const major = Math.max(0, Math.trunc(Number(wounds.major?.value ?? 0)));

    let restControl = '<input type="hidden" name="restChoice" value="">';
    let restHint = "This recovery does not remove Wounds through rest.";

    if (recoveryType === "tenMinutes") {
      restControl = '<input type="hidden" name="restChoice" value="minor">';
      restHint = minor > 0
        ? `Rest will remove all ${minor} Minor Wound${minor === 1 ? "" : "s"}.`
        : "No Minor Wounds to remove.";
    } else if (recoveryType === "oneHour") {
      const choices = [];
      if (moderate > 0) choices.push('<option value="moderate">Remove one Moderate Wound</option>');
      if (minor > 0) choices.push('<option value="minor">Remove all Minor Wounds</option>');

      if (choices.length > 1) {
        restControl = `<select name="restChoice">${choices.join("")}</select>`;
      } else if (moderate > 0) {
        restControl = '<input type="hidden" name="restChoice" value="moderate"><span>Remove one Moderate Wound</span>';
      } else if (minor > 0) {
        restControl = '<input type="hidden" name="restChoice" value="minor"><span>Remove all Minor Wounds</span>';
      }
      restHint = choices.length > 1
        ? "Choose the one-hour rest Wound benefit."
        : choices.length === 1
          ? "This Wound benefit will be applied with the recovery."
          : "No Minor or Moderate Wounds to remove.";
    } else if (recoveryType === "tenHours") {
      if (moderate > 0 && minor > 0) {
        restControl = `<select name="restChoice">
          <option value="moderate">Remove all Moderate Wounds</option>
          <option value="minorExchange">Remove all Minor Wounds instead of removing one Moderate Wound</option>
        </select>`;
      } else {
        restControl = '<input type="hidden" name="restChoice" value="moderate"><span>Remove all Moderate Wounds</span>';
      }
      restHint = major > 0
        ? "After the rest, a difficulty 6 Might task will determine whether one Major Wound is also removed."
        : "Ten-hour rest removes Moderate Wounds according to the selected option.";
    }

    const poolMarkup = ["might", "speed", "intellect"].map(key => {
      const state = poolState[key];
      const label = key[0].toUpperCase() + key.slice(1);
      const lastingHint = state.lastingDamage > 0
        ? `Effective maximum ${state.effectiveMax}; base maximum ${state.baseMax}, reduced by ${state.lastingDamage} Lasting/Permanent Damage.`
        : `Effective maximum ${state.effectiveMax}.`;
      const disabled = state.missing === 0 ? " disabled" : "";

      return `<div class="form-group cypher-c2-recovery-pool" data-recovery-pool="${key}">
        <div class="cypher-c2-recovery-pool-head">
          <label>${label} <span>${state.value}/${state.effectiveMax}</span></label>
          <span class="cypher-c2-recovery-cap">Recover up to <strong>${state.missing}</strong></span>
        </div>
        <div class="form-fields">
          <input
            class="cypher-c2-recovery-input"
            name="${key}"
            type="number"
            min="0"
            max="${state.missing}"
            step="1"
            value="0"
            data-max-recovery="${state.missing}"
            ${disabled}
          >
        </div>
        <p class="hint cypher-c2-recovery-pool-note">${lastingHint}</p>
      </div>`;
    }).join("");

    const allocation = await foundry.applications.api.DialogV2.input({
      window: {title: "Recovery Allocation"},
      position: {width: 520, height: "auto"},
      content: `
        <div class="cypher-c2-recovery-dialog">
          <div class="cypher-c2-recovery-result-card">
            <span class="cypher-c2-recovery-result-kicker">RECOVERY RESULT</span>
            <div class="cypher-c2-recovery-result-value">
              <strong>${recoveredPoints}</strong>
              <span>recovery point${recoveredPoints === 1 ? "" : "s"}</span>
            </div>
            <div class="cypher-c2-recovery-budget">
              <span>Allocated <strong data-recovery-allocated>0</strong> / ${recoveredPoints}</span>
              <span><strong data-recovery-remaining>${recoveredPoints}</strong> remaining</span>
            </div>
          </div>

          <p class="hint cypher-c2-recovery-instruction">Divide the result among your stat Pools. You may leave points unspent.</p>

          <div class="cypher-c2-recovery-pools">${poolMarkup}</div>

          <div class="cypher-c2-recovery-rest">
            <div class="form-group">
              <label>Rest & Wounds</label>
              <div class="form-fields">${restControl}</div>
              <p class="hint">${restHint}</p>
            </div>
          </div>

          <div class="cypher-c2-recovery-validation" data-recovery-validation role="alert" hidden></div>
        </div>`,
      ok: {
        label: "Apply Recovery",
        icon: "fa-solid fa-heart-pulse",
        class: "cypher-c2-recovery-apply"
      },
      render: (_event, dialog) => {
        const root = dialog.element;
        const form = root.querySelector("form");
        const inputs = Array.from(root.querySelectorAll(".cypher-c2-recovery-input"));
        const applyButton = root.querySelector(".cypher-c2-recovery-apply");
        const allocatedElement = root.querySelector("[data-recovery-allocated]");
        const remainingElement = root.querySelector("[data-recovery-remaining]");
        const validationElement = root.querySelector("[data-recovery-validation]");

        const validate = () => {
          let allocated = 0;
          const messages = [];

          for (const input of inputs) {
            const raw = String(input.value ?? "").trim();
            const value = raw === "" ? 0 : Number(raw);
            const maximum = Math.max(0, Number(input.dataset.maxRecovery ?? 0));
            let message = "";

            if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
              message = "Recovery allocations must be whole numbers of 0 or more.";
            } else {
              allocated += value;
              if (value > maximum) {
                const poolName = input.name[0].toUpperCase() + input.name.slice(1);
                message = `${poolName} can recover at most ${maximum} point${maximum === 1 ? "" : "s"}.`;
              }
            }

            input.classList.toggle("is-invalid", Boolean(message));
            input.setAttribute("aria-invalid", message ? "true" : "false");
            input.setCustomValidity(message);
            if (message) messages.push(message);
          }

          if (allocated > recoveredPoints) {
            messages.push(`You allocated ${allocated} points, but this recovery provides only ${recoveredPoints}.`);
          }

          const valid = messages.length === 0;
          if (allocatedElement) allocatedElement.textContent = String(allocated);
          if (remainingElement) remainingElement.textContent = String(Math.max(0, recoveredPoints - allocated));
          if (validationElement) {
            validationElement.hidden = valid;
            validationElement.textContent = valid ? "" : messages[0];
          }
          if (applyButton) applyButton.disabled = !valid;
          return valid;
        };

        for (const input of inputs) {
          input.addEventListener("input", validate);
          input.addEventListener("change", validate);
        }

        form?.addEventListener("submit", event => {
          if (validate()) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, true);

        validate();
        const firstAvailable = inputs.find(input => !input.disabled);
        firstAvailable?.focus();
      },
      rejectClose: false,
      modal: true
    });
    if (!allocation) return;

    let applied;
    try {
      applied = await applyC2Recovery(this.actor, {
        type: recoveryType,
        recoveredPoints,
        allocations: {
          might: allocation.might,
          speed: allocation.speed,
          intellect: allocation.intellect
        },
        restChoice: String(allocation.restChoice ?? "")
      });
    } catch (error) {
      ui.notifications.warn(error.message);
      return;
    }

    let majorCheckSummary = "";
    if (applied.majorCheckRequired) {
      const check = await rollEngineMain({
        actorUuid: this.actor.uuid,
        pool: "Might",
        baseDifficulty: 6,
        skipDialog: true,
        title: "Major Wound Recovery"
      });

      if (check?.rollSucceeded) {
        const currentMajor = Math.max(
          0,
          Math.trunc(Number(this.actor.system.combat?.wounds?.major?.value ?? 0))
        );
        if (currentMajor > 0) {
          await this.actor.update({"system.combat.wounds.major.value": currentMajor - 1});
          majorCheckSummary = "Major Wound recovery check succeeded: removed one Major Wound.";
        }
      } else {
        majorCheckSummary = "Major Wound recovery check failed: no Major Wound removed.";
      }
    }

    const recoveryUsed = game.i18n.localize(usedKeys[recoveryType]);
    await sendRecoveryRollCard(this.actor, roll, {
      formula,
      recoveryUsed,
      lastAction,
      allocations: applied.allocations,
      allocatedTotal: applied.allocatedTotal,
      unspent: applied.unspent,
      restSummary: applied.restSummary,
      majorCheckSummary,
      allowReroll: false
    });
  }

  static async _resetRecovery(event) {
    event.preventDefault();
    if (!this.isEditable) return;

    await this.actor.update({
      "system.combat.recoveries.oneAction": false,
      "system.combat.recoveries.oneAction2": false,
      "system.combat.recoveries.oneAction3": false,
      "system.combat.recoveries.oneAction4": false,
      "system.combat.recoveries.oneAction5": false,
      "system.combat.recoveries.oneAction6": false,
      "system.combat.recoveries.oneAction7": false,
      "system.combat.recoveries.tenMinutes": false,
      "system.combat.recoveries.tenMinutes2": false,
      "system.combat.recoveries.oneHour": false,
      "system.combat.recoveries.tenHours": false
    });
  }

  static async _takeWound(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const woundType = target.dataset.woundType;
    if (!["minor", "moderate", "major"].includes(woundType)) return;

    const result = await applyWound(this.actor, woundType, 1);
    if (result.dead) {
      ui.notifications.error(`${this.actor.name} has taken their final Major Wound.`);
    }
  }

  static async _rallyWound(event) {
    event.preventDefault();
    if (!this.isEditable) return;

    if (this.actor.system.basic?.unmaskedForm === "Teen") {
      ui.notifications.warn("Cypher 2026 Rally automation is not enabled for the legacy Teen form.");
      return;
    }

    const state = getWoundState(this.actor);
    if (state.dead) {
      ui.notifications.warn("A character who has taken their final Major Wound is dead and cannot rally.");
      return;
    }

    const currentMight = Math.max(0, Math.trunc(Number(this.actor.system.pools?.might?.value ?? 0)));
    const entries = [
      {severity: "minor", label: "Minor", count: state.minor.value, cost: 2, superheroic: false},
      {severity: "moderate", label: "Moderate", count: state.moderate.value, cost: 5, superheroic: false},
      {severity: "major", label: "Major", count: state.major.value, cost: 10, superheroic: true}
    ].filter(entry => entry.count > 0);

    if (!entries.length) {
      ui.notifications.info("This character has no Wounds to rally.");
      return;
    }

    const optionMarkup = entries.map(entry => {
      const affordable = currentMight >= entry.cost;
      const suffix = entry.superheroic ? " - superheroic games only" : "";
      return `<option value="${entry.severity}" ${affordable ? "" : "disabled"}>${entry.label} Wound - ${entry.cost} Might${suffix}</option>`;
    }).join("");

    if (!entries.some(entry => currentMight >= entry.cost)) {
      ui.notifications.warn(`Rally requires more Might than ${this.actor.name} currently has (${currentMight}).`);
      return;
    }

    const choice = await foundry.applications.api.DialogV2.input({
      window: {title: "Rally"},
      content: `
        <div class="form-group">
          <label>Wound to rally</label>
          <div class="form-fields"><select name="severity" autofocus>${optionMarkup}</select></div>
        </div>
        <p class="hint">Current Might: <strong>${currentMight}</strong>. Rally removes one Wound, takes one action, and its Might cost is not reduced by Might Edge.</p>`,
      ok: {label: "Rally", icon: "fa-solid fa-bolt"},
      rejectClose: false,
      modal: true
    });
    if (!choice) return;

    const severity = String(choice.severity ?? "");
    if (!entries.some(entry => entry.severity === severity)) return;

    let allowMajor = false;
    if (severity === "major") {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: {title: "Superheroic Major Rally"},
        content: "<p>Cypher 2026 normally does not allow rallying a Major Wound. Superhero characters and similarly superheroic games may rally one Major Wound by spending <strong>10 Might</strong> and one action.</p><p>Use the superheroic Major Rally rule for this action?</p>",
        yes: {label: "Use Superheroic Rally", icon: "fa-solid fa-bolt"},
        no: {label: "Cancel"},
        rejectClose: false,
        modal: true
      });
      if (!confirmed) return;
      allowMajor = true;
    }

    try {
      const result = await rallyWound(this.actor, severity, {allowMajor});
      const label = severity[0].toUpperCase() + severity.slice(1);
      ui.notifications.info(`Rallied one ${label} Wound for ${result.cost} Might. Might Edge was not applied.`);
    } catch (error) {
      ui.notifications.warn(error.message);
    }
  }

  static async _treatWound(event) {
    event.preventDefault();
    if (!this.isEditable) return;

    if (this.actor.system.basic?.unmaskedForm === "Teen") {
      ui.notifications.warn("Cypher 2026 Treatment automation is not enabled for the legacy Teen form.");
      return;
    }

    const state = getWoundState(this.actor);
    if (state.dead) {
      ui.notifications.warn("A character who has taken their final Major Wound is dead and cannot use ordinary Treatment.");
      return;
    }

    const entries = [
      {severity: "minor", label: "Minor", count: state.minor.value},
      {severity: "moderate", label: "Moderate", count: state.moderate.value},
      {severity: "major", label: "Major", count: state.major.value}
    ].filter(entry => entry.count > 0);

    if (!entries.length) {
      ui.notifications.info("This character has no Wounds to treat.");
      return;
    }

    const severityMarkup = entries.map(entry => {
      const difficulty = getTreatmentDifficulty(entry.severity);
      const time = getSuggestedTreatmentTime(entry.severity);
      return `<option value="${entry.severity}">${entry.label} Wound - difficulty ${difficulty}, default ${time}</option>`;
    }).join("");

    const severityChoice = await foundry.applications.api.DialogV2.input({
      window: {title: "Treatment"},
      content: `
        <div class="form-group">
          <label>Wound to treat</label>
          <div class="form-fields"><select name="severity" autofocus>${severityMarkup}</select></div>
        </div>
        <p class="hint">Treatment is an Intellect task using the Healing skill. The listed time is the default suggestion; Cypher genres can replace it with a different treatment time.</p>`,
      ok: {label: "Continue", icon: "fa-solid fa-kit-medical"},
      rejectClose: false,
      modal: true
    });
    if (!severityChoice) return;

    const severity = String(severityChoice.severity ?? "");
    if (!entries.some(entry => entry.severity === severity)) return;

    const difficulty = getTreatmentDifficulty(severity);
    const time = getSuggestedTreatmentTime(severity);
    const label = severity[0].toUpperCase() + severity.slice(1);

    const ratingValues = {Inability: -1, Practiced: 0, Trained: 1, Specialized: 2, Expert: 3};
    const healingSkill = [...this.actor.items].find(item => {
      if (item.type !== "skill" || item.system?.archived) return false;
      const name = String(item.name ?? "").trim().toLowerCase();
      return name === "healing" || name === "medicine";
    });
    const defaultSkillLevel = ratingValues[healingSkill?.system?.basic?.rating] ?? 0;
    const effortMax = Math.max(0, Math.min(6, Math.trunc(Number(this.actor.system.basic?.effort ?? 0))));

    const skillOptions = [
      [-1, "Inability"],
      [0, "Practiced"],
      [1, "Trained"],
      [2, "Specialized"],
      [3, "Expert"]
    ].map(([value, optionLabel]) => `<option value="${value}" ${value === defaultSkillLevel ? "selected" : ""}>${optionLabel}</option>`).join("");

    const effortOptions = Array.from({length: effortMax + 1}, (_, value) =>
      `<option value="${value}">${value}</option>`
    ).join("");

    const modifiers = await foundry.applications.api.DialogV2.input({
      window: {title: `Treat ${label} Wound`},
      content: `
        <div class="form-group">
          <label>Base difficulty</label>
          <div class="form-fields"><strong>${difficulty}</strong></div>
          <p class="hint">Default treatment time: ${time}. Genre rules may change the required time.</p>
        </div>
        <div class="form-group">
          <label>Healing skill</label>
          <div class="form-fields"><select name="skillLevel">${skillOptions}</select></div>
          <p class="hint">If a non-archived skill named Healing or Medicine exists, its rating is selected automatically. You can change it here.</p>
        </div>
        <div class="form-group">
          <label>Assets</label>
          <div class="form-fields">
            <select name="assets">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Effort to ease</label>
          <div class="form-fields"><select name="effortToEase">${effortOptions}</select></div>
          <p class="hint">This action uses this character's Intellect Pool. Standard Pool costs, Edge, Wound hindrance, Stress, and other Roll Engine modifiers still apply.</p>
        </div>`,
      ok: {label: "Make Treatment Roll", icon: "fa-solid fa-dice-d20"},
      rejectClose: false,
      modal: true
    });
    if (!modifiers) return;

    const skillLevel = Math.max(-1, Math.min(3, Math.trunc(Number(modifiers.skillLevel ?? 0))));
    const assets = Math.max(0, Math.min(2, Math.trunc(Number(modifiers.assets ?? 0))));
    const effortToEase = Math.max(0, Math.min(effortMax, Math.trunc(Number(modifiers.effortToEase ?? 0))));

    const result = await rollEngineMain({
      actorUuid: this.actor.uuid,
      pool: "Intellect",
      baseDifficulty: difficulty,
      skillLevel,
      assets,
      effortToEase,
      skipDialog: true,
      title: `Treatment: ${label} Wound`
    });

    if (!result) return;
    if (!result.rollSucceeded) {
      ui.notifications.warn(`Treatment failed. The ${label} Wound remains.`);
      return;
    }

    try {
      const healed = await removeWound(this.actor, severity, 1);
      if (healed.removed > 0) {
        ui.notifications.info(`Treatment succeeded: removed one ${label} Wound.`);
      }
    } catch (error) {
      ui.notifications.warn(error.message);
    }
  }

  static async _applyPoolDamage(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    if (this.actor.system.basic?.unmaskedForm === "Teen") {
      ui.notifications.warn("Cypher 2026 Pool-damage conversion is not enabled for the legacy Teen form.");
      return;
    }

    const pool = {
      might: "Might",
      speed: "Speed",
      intellect: "Intellect"
    }[target.dataset.pool];
    if (!pool) return;

    const current = Number(this.actor.system.pools?.[target.dataset.pool]?.value ?? 0);
    const response = await foundry.applications.api.DialogV2.input({
      window: {title: `Apply ${pool} Damage`},
      content: `
        <div class="form-group">
          <label>Damage to ${pool}</label>
          <div class="form-fields">
            <input name="damage" type="text" inputmode="numeric" pattern="[0-9]+" value="1" autocomplete="off" autofocus>
          </div>
          <p class="hint">Current ${pool} Pool: ${Number.isFinite(current) ? current : 0}. Excess damage after the Pool reaches 0 converts to a Wound.</p>
        </div>`,
      ok: {
        label: "Apply Damage",
        icon: "fa-solid fa-heart-crack"
      },
      render: (_event, dialog) => {
        requestAnimationFrame(() => {
          const input = dialog.element.querySelector('input[name="damage"]');
          input?.focus();
          input?.select();
        });
      },
      rejectClose: false,
      modal: true
    });

    if (!response) return;

    const damage = Math.trunc(Number(response.damage));
    if (!Number.isFinite(damage) || damage < 1) {
      ui.notifications.warn("Damage must be a positive whole number.");
      return;
    }

    const result = await applyPoolDamage(this.actor, pool, damage);

    if (result.woundSeverity) {
      const severityLabel = result.woundSeverity[0].toUpperCase() + result.woundSeverity.slice(1);
      ui.notifications.info(
        `${result.overflowDamage} excess ${pool} damage converted to a ${severityLabel} Wound.`
      );
    }

    if (result.woundState.dead) {
      ui.notifications.error(`${this.actor.name} has taken their final Major Wound.`);
    }
  }

  static async _resetWoundRow(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const woundType = target.dataset.woundType;
    if (!["minor", "moderate", "major"].includes(woundType)) return;

    await this.actor.update({
      [`system.combat.wounds.${woundType}.value`]: 0
    });
  }

  static async _rollAttack(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "attack") return;

    const macroUuid = item.system.settings?.rollButton?.macroUuid ?? "";

    await itemRollMacro(
      this.actor,
      item.id,
      "", "", "", "", "", "", "", "", "", "", "", "",
      false,
      "",
      macroUuid,
      ""
    );
  }

  static async _createCombatItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const type = target.dataset.itemType;
    const itemNames = {
      attack: "New Attack",
      armor: "New Armor",
      ammo: "New Ammo",
      "lasting-damage": "New Lasting Damage"
    };

    const name = itemNames[type];
    if (!name) return;

    const created = await this.actor.createEmbeddedDocuments("Item", [{name, type}]);
    created[0]?.sheet?.render(true);
  }

  static async _adjustCombatItemValue(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !["ammo", "lasting-damage"].includes(item.type)) return;

    const field = target.dataset.itemField;
    const expectedField = item.type === "ammo" ? "quantity" : "damage";
    if (field !== expectedField) return;

    const direction = target.dataset.direction === "decrease" ? -1 : 1;
    const rawCurrent = Number(item.system.basic?.[field] ?? 0);
    const current = Number.isFinite(rawCurrent) ? Math.trunc(rawCurrent) : 0;
    const altPressed = Boolean(event.altKey) || Boolean(game.keyboard?.isModifierActive?.("Alt"));
    const amount = item.type === "ammo" && altPressed ? 10 : 1;
    const next = Math.max(0, current + direction * amount);

    if (next === current) return;
    await item.update({[`system.basic.${field}`]: next});
  }

  static _editCombatItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    item?.sheet?.render(true);
  }

  static async _toggleArmor(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "armor") return;

    const activate = !item.system.active;
    if (!activate) {
      await item.update({"system.active": false});
      return;
    }

    // Cypher 2026 treats this as the armor being worn; keep one worn Armor item.
    const updates = Array.from(this.actor.items)
      .filter(candidate => candidate.type === "armor")
      .map(candidate => ({
        _id: candidate.id,
        "system.active": candidate.id === item.id
      }));
    await this.actor.updateEmbeddedDocuments("Item", updates);
  }

  static async _toggleArmorFreeUse(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "armor") return;

    await item.update({"system.basic.freelyUse": !Boolean(item.system.basic?.freelyUse)});
  }

  static async _rollArmorDefense(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const armorTask = target.dataset.armorTask;
    if (!["block", "dodge"].includes(armorTask)) return;

    await rollEngineMain({
      actorUuid: this.actor.uuid,
      pool: armorTask === "block" ? "Might" : "Speed",
      armorTask,
      title: armorTask === "block" ? "Block" : "Dodge"
    });
  }

  static async _combatItemDescription(event, target) {
    event.preventDefault();

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !["attack", "armor", "ammo", "lasting-damage"].includes(item.type)) return;

    if (item.system.basic?.identified === false) {
      return ui.notifications.warn(
        game.i18n.localize("CYPHERSYSTEM.WarnSentUnidentifiedToChat")
      );
    }

    const content = await buildItemCard(this.actor, item);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor: this.actor}),
      content,
      flags: {
        itemID: item.id,
        cyphersystem: {
          cardType: "item-description",
          actorUuid: this.actor.uuid,
          itemUuid: item.uuid,
          itemId: item.id
        }
      }
    });
  }

  static async _deleteCombatItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !["attack", "armor", "ammo", "lasting-damage"].includes(item.type)) return;

    const altPressed =
      Boolean(event.altKey) ||
      Boolean(game.keyboard?.isModifierActive?.("Alt"));

    if (altPressed) {
      await item.delete();
      return;
    }

    await item.update({"system.archived": !Boolean(item.system.archived)});
  }

  static async _useAbility(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "ability" || item.system.archived) return;

    const macroUuid = item.system.settings?.rollButton?.macroUuid ?? "";

    await itemRollMacro(
      this.actor,
      item.id,
      "", "", "", "", "", "", "", "", "", "", "", "",
      true,
      "",
      macroUuid,
      ""
    );
  }

  static async _createAbilityItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const category = target.dataset.abilityCategory;
    const categories = ["Ability", "AbilityTwo", "AbilityThree", "AbilityFour", "Spell"];
    if (!categories.includes(category)) return;

    const isTeen = this.actor.system.basic?.unmaskedForm === "Teen";
    if (isTeen && category !== "Ability") return;

    const nameKey = isTeen ? "CYPHERSYSTEM.NewTeenAbility" : "CYPHERSYSTEM.NewAbility";
    const created = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.localize(nameKey),
      type: "ability",
      system: {
        settings: {
          general: {
            sorting: category,
            unmaskedForm: isTeen ? "Teen" : "Mask"
          }
        }
      }
    }]);

    created[0]?.sheet?.render(true);
  }

  static _editAbilityItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "ability") return;

    item.sheet?.render(true);
  }

  static async _toggleAbilityFavorite(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "ability") return;

    await item.update({"system.favorite": !Boolean(item.system.favorite)});
  }

  static async _abilityItemDescription(event, target) {
    event.preventDefault();

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "ability") return;

    const ability = getAbilityDisplayData(item);
    const isTeen = this.actor.system.basic?.unmaskedForm === "Teen";
    const cardMeta = [ability.costMetaLabel, isTeen ? "" : ability.spellPowerLabel]
      .filter(Boolean)
      .join(" · ");
    const content = await buildItemCard(this.actor, item, {meta: cardMeta});

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor: this.actor}),
      content,
      flags: {
        itemID: item.id,
        cyphersystem: {
          cardType: "item-description",
          actorUuid: this.actor.uuid,
          itemUuid: item.uuid,
          itemId: item.id
        }
      }
    });
  }

  static async _deleteAbilityItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "ability") return;

    const altPressed =
      Boolean(event.altKey) ||
      Boolean(game.keyboard?.isModifierActive?.("Alt"));

    if (altPressed) {
      await item.delete();
      return;
    }

    await item.update({"system.archived": !Boolean(item.system.archived)});
  }

  static async _rollSkill(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "skill" || item.system.archived) return;

    const macroUuid = item.system.settings?.rollButton?.macroUuid ?? "";

    await itemRollMacro(
      this.actor,
      item.id,
      "", "", "", "", "", "", "", "", "", "", "", "",
      false,
      "",
      macroUuid,
      ""
    );
  }

  static async _createSkillItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const category = target.dataset.skillCategory;
    const categories = ["Skill", "SkillTwo", "SkillThree", "SkillFour"];
    if (!categories.includes(category)) return;

    const isTeen = this.actor.system.basic?.unmaskedForm === "Teen";
    const nameKey = isTeen ? "CYPHERSYSTEM.NewTeenSkill" : "CYPHERSYSTEM.NewSkill";
    const created = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.localize(nameKey),
      type: "skill",
      system: {
        settings: {
          general: {
            sorting: category,
            unmaskedForm: isTeen ? "Teen" : "Mask"
          }
        }
      }
    }]);

    created[0]?.sheet?.render(true);
  }

  static _editSkillItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "skill") return;

    item.sheet?.render(true);
  }

  static async _toggleSkillFavorite(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "skill") return;

    await item.update({"system.favorite": !Boolean(item.system.favorite)});
  }

  static async _skillItemDescription(event, target) {
    event.preventDefault();

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "skill") return;

    const content = await buildItemCard(this.actor, item);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor: this.actor}),
      content,
      flags: {
        itemID: item.id,
        cyphersystem: {
          cardType: "item-description",
          actorUuid: this.actor.uuid,
          itemUuid: item.uuid,
          itemId: item.id
        }
      }
    });
  }

  static async _deleteSkillItem(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;

    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "skill") return;

    const altPressed =
      Boolean(event.altKey) ||
      Boolean(game.keyboard?.isModifierActive?.("Alt"));

    if (altPressed) {
      await item.delete();
      return;
    }

    await item.update({"system.archived": !Boolean(item.system.archived)});
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system;
    const isTeen = system.basic?.unmaskedForm === "Teen";
    const profile = isTeen ? system.teen?.basic ?? {} : system.basic ?? {};
    const pools = isTeen ? system.teen?.pools ?? {} : system.pools ?? {};

    const staticStatsLocked = Boolean(
      actor.getFlag("cyphersystem", "disabledStaticStats") ||
      actor.getFlag("cyphersystem", "multiRoll.active")
    );

    const canEdit = this.isEditable;
    const canEditStatic = canEdit && !staticStatsLocked;

    const rollButtons = Number(game.settings.get("cyphersystem", "rollButtons")) || 0;
    const useAllInOne = Boolean(game.settings.get("cyphersystem", "itemMacrosUseAllInOne"));
    const corePoolNames = {
      might: "Might",
      speed: "Speed",
      intellect: "Intellect"
    };

    const lastingDamageByPool = {
      Might: 0,
      Speed: 0,
      Intellect: 0
    };

    for (const item of actor.items) {
      if (item.type !== "lasting-damage" || item.system.archived) continue;

      const poolName = item.system.basic?.pool;
      if (!(poolName in lastingDamageByPool)) continue;

      const damage = Number(item.system.basic?.damage ?? 0);
      if (!Number.isFinite(damage)) continue;

      lastingDamageByPool[poolName] += Math.max(0, Math.trunc(damage));
    }

    const makePool = (key, label) => {
      const pool = pools[key] ?? {};
      const rawValue = Number(pool.value ?? 0);
      const max = Math.max(0, Number(pool.max ?? 0));
      const poolName = corePoolNames[key] ?? null;
      const lastingDamage = poolName ? lastingDamageByPool[poolName] : 0;
      const effectiveMax = Math.max(0, Math.trunc(max) - lastingDamage);
      const value = Math.max(
        0,
        Math.min(
          effectiveMax,
          Number.isFinite(rawValue) ? Math.trunc(rawValue) : 0
        )
      );
      const basePath = isTeen
        ? `system.teen.pools.${key}`
        : `system.pools.${key}`;

      return {
        key,
        label,
        value,
        max,
        effectiveMax,
        lastingDamage,
        hasLastingDamage: lastingDamage > 0,
        edge: Number(pool.edge ?? 0),
        percent: effectiveMax > 0
          ? Math.max(0, Math.min(100, Math.round((value / effectiveMax) * 100)))
          : 0,
        valueField: `${basePath}.value`,
        maxField: `${basePath}.max`,
        edgeField: `${basePath}.edge`
      };
    };

    const descriptor = profile.descriptor ?? "";
    const type = isTeen ? "" : system.basic?.type ?? "";
    const focus = isTeen ? "" : system.basic?.focus ?? "";

    const who = game.i18n.localize("CYPHERSYSTEM.Who");

    const sentence = [
    descriptor,
    type,
    focus ? `${who} ${focus}` : ""
]
    .filter(Boolean)
    .join(" ");

    const additionalSentenceSettings =
      system.settings?.general?.additionalSentence ?? {};

    const additionalSettings = isTeen
      ? system.teen?.settings?.general?.additionalPool
      : system.settings?.general?.additionalPool;

    let additionalPool = null;
    if (additionalSettings?.active && pools.additional) {
      additionalPool = makePool(
        "additional",
        (isTeen ? additionalSettings.name : additionalSettings.label) ||
          game.i18n.localize("CYPHERSYSTEM.AdditionalPool")
      );
      additionalPool.hasEdge = Boolean(additionalSettings.hasEdge);
    }

    const clampWoundNumber = (value, minimum, maximum) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return minimum;
      return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
    };

    const woundSource = system.combat?.wounds ?? {};
    const woundMaxChoices = Object.fromEntries(
      Array.from({length: 10}, (_, index) => {
        const value = index + 1;
        return [String(value), value];
      })
    );

    const createWoundRow = (key, label) => {
      const max = clampWoundNumber(woundSource[key]?.max ?? 3, 1, 10);
      const value = clampWoundNumber(woundSource[key]?.value ?? 0, 0, max);

      let effectText = "";
      let effectClass = "wound-effect-minor";

      if (key === "minor" && value === max) {
        effectText = "Minor Wounds now become Moderate Wounds.";
      }

      if (key === "moderate" && value === max) {
        effectText = "Hindered. Moderate Wounds now become Major Wounds.";
        effectClass = "wound-effect-moderate";
      }

      if (key === "major" && value > 0) {
        effectText = value === max
          ? "Dead."
          : game.i18n.format("CYPHERSYSTEM.HinderedBySteps", {amount: value});
        effectClass = value === max ? "wound-effect-dead" : "wound-effect-major";
      }

      return {
        key,
        label,
        value,
        max,
        effectText,
        effectClass,
        boxes: Array.from({length: max}, (_, index) => ({
          number: index + 1,
          isChecked: index < value
        }))
      };
    };

    const woundRows = [
      createWoundRow("minor", "Minor Wound"),
      createWoundRow("moderate", "Moderate Wound"),
      createWoundRow("major", "Major Wound")
    ];
    const woundHindrance = getWoundHindrance(actor);
    const hasWounds = woundRows.some(wound => wound.value > 0);

    const recoveries = system.combat?.recoveries ?? {};
    const oneActionCount = Math.max(
      0,
      Math.min(7, Number(system.settings?.combat?.numberOneActionRecoveries ?? 1))
    );
    const tenMinuteCount = Math.max(
      0,
      Math.min(2, Number(system.settings?.combat?.numberTenMinuteRecoveries ?? 1))
    );

    const makeRecoverySteps = (prefix, count) =>
      Array.from({length: count}, (_, index) => {
        const field = index === 0
          ? `system.combat.recoveries.${prefix}`
          : `system.combat.recoveries.${prefix}${index + 1}`;

        const property = index === 0 ? prefix : `${prefix}${index + 1}`;

        return {
          number: index + 1,
          field,
          checked: Boolean(recoveries[property])
        };
      });

    const recovery = {
      formula: getC2RecoveryFormula(actor),
      groups: [
        {
          label: game.i18n.localize("CYPHERSYSTEM.RecoveryAction"),
          steps: makeRecoverySteps("oneAction", oneActionCount)
        },
        {
          label: game.i18n.localize("CYPHERSYSTEM.RecoveryMinutes"),
          steps: makeRecoverySteps("tenMinutes", tenMinuteCount)
        },
        {
          label: game.i18n.localize("CYPHERSYSTEM.RecoveryHour"),
          steps: [{
            number: 1,
            field: "system.combat.recoveries.oneHour",
            checked: Boolean(recoveries.oneHour)
          }]
        },
        {
          label: game.i18n.localize("CYPHERSYSTEM.RecoveryHours"),
          steps: [{
            number: 1,
            field: "system.combat.recoveries.tenHours",
            checked: Boolean(recoveries.tenHours)
          }]
        }
      ].filter(group => group.steps.length)
    };

    const titleCase = value =>
      String(value ?? "")
        .replaceAll("-", " ")
        .replace(/\b\w/g, character => character.toUpperCase());

    const sortedItems = [...actor.items]
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));

    const currentAbilityForm = isTeen ? "Teen" : "Mask";
    const hideArchivedAbilities = Boolean(system.settings?.general?.hideArchive);
    const validAbilityCategories = ["Ability", "AbilityTwo", "AbilityThree", "AbilityFour", "Spell"];
    const matchingAbilityItems = sortedItems
      .filter(item => {
        if (item.type !== "ability") return false;
        if (hideArchivedAbilities && item.system.archived) return false;

        const storedForm = item.system.settings?.general?.unmaskedForm;
        const itemForm = ["Mask", "Teen"].includes(storedForm)
          ? storedForm
          : currentAbilityForm;
        return itemForm === currentAbilityForm;
      })
      .sort((a, b) => {
        const archiveOrder = Number(Boolean(a.system.archived)) - Number(Boolean(b.system.archived));
        if (archiveOrder) return archiveOrder;

        const favoriteOrder = Number(Boolean(b.system.favorite)) - Number(Boolean(a.system.favorite));
        if (favoriteOrder) return favoriteOrder;

        return (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);
      });

    const preparedAbilities = await Promise.all(
      matchingAbilityItems.map(async item => {
        const display = getAbilityDisplayData(item);
        const category = isTeen
          ? "Ability"
          : validAbilityCategories.includes(display.category)
            ? display.category
            : "Ability";
        const isSpell = category === "Spell";
        const cardMeta = [display.costMetaLabel, isSpell ? display.spellPowerLabel : ""]
          .filter(Boolean)
          .join(" · ");

        return {
          id: item.id,
          archived: Boolean(item.system.archived),
          favorite: Boolean(item.system.favorite),
          name: item.name,
          img: item.img,
          category,
          costLabel: display.costLabel,
          hasCost: display.hasCost,
          isSpell,
          spellPowerLabel: isSpell ? display.spellPowerLabel : "",
          previewHtml: await buildItemCard(actor, item, {meta: cardMeta})
        };
      })
    );

    const abilitiesByCategory = {
      Ability: [],
      AbilityTwo: [],
      AbilityThree: [],
      AbilityFour: [],
      Spell: []
    };

    for (const ability of preparedAbilities) {
      abilitiesByCategory[ability.category].push(ability);
    }

    const abilitySettings = system.settings?.abilities ?? {};
    const abilityCategoryDefinitions = [
      {
        id: "Ability",
        label: abilitySettings.labelCategory1 || game.i18n.localize("CYPHERSYSTEM.Abilities"),
        configured: true,
        isSpell: false
      },
      {
        id: "AbilityTwo",
        label: abilitySettings.labelCategory2 || game.i18n.localize("CYPHERSYSTEM.AbilityCategoryTwo"),
        configured: Boolean(abilitySettings.labelCategory2),
        isSpell: false
      },
      {
        id: "AbilityThree",
        label: abilitySettings.labelCategory3 || game.i18n.localize("CYPHERSYSTEM.AbilityCategoryThree"),
        configured: Boolean(abilitySettings.labelCategory3),
        isSpell: false
      },
      {
        id: "AbilityFour",
        label: abilitySettings.labelCategory4 || game.i18n.localize("CYPHERSYSTEM.AbilityCategoryFour"),
        configured: Boolean(abilitySettings.labelCategory4),
        isSpell: false
      },
      {
        id: "Spell",
        label: abilitySettings.labelSpells || game.i18n.localize("CYPHERSYSTEM.Spells"),
        configured: Boolean(abilitySettings.labelSpells),
        isSpell: true
      }
    ];

    const hideEmptyAbilityCategories = Boolean(system.settings?.general?.hideEmptyCategories);
    const abilityCategories = abilityCategoryDefinitions
      .filter(category => !isTeen || category.id === "Ability")
      .filter(category =>
        category.id === "Ability" ||
        category.configured ||
        abilitiesByCategory[category.id].length > 0
      )
      .filter(category =>
        category.id === "Ability" ||
        !hideEmptyAbilityCategories ||
        abilitiesByCategory[category.id].length > 0
      )
      .map(category => ({
        id: category.id,
        label: category.label,
        isSpell: category.isSpell,
        abilities: abilitiesByCategory[category.id],
        count: abilitiesByCategory[category.id].length
      }));

    const preparedSpellsValue = Number(system.abilities?.preparedSpells ?? 0);
    const preparedSpells = Number.isFinite(preparedSpellsValue)
      ? Math.max(0, Math.trunc(preparedSpellsValue))
      : 0;

    const skillRankValues = {
      Inability: -1,
      Practiced: 0,
      Trained: 1,
      Specialized: 2,
      Expert: 3
    };

    const skillRanks = ["Inability", "Trained", "Specialized", "Expert"].map(rating => {
      const steps = skillRankValues[rating];
      return {
        rating,
        label: game.i18n.localize(`CYPHERSYSTEM.${rating}`),
        stepsLabel: `${steps > 0 ? "+" : ""}${steps}`,
        tone: rating.toLowerCase()
      };
    });

    const currentSkillForm = isTeen ? "Teen" : "Mask";
    const hideArchivedSkills = Boolean(system.settings?.general?.hideArchive);
    const sortSkillsByRating = Boolean(system.settings?.skills?.sortByRating);
    const skillPoolLabels = {
      Might: game.i18n.localize("CYPHERSYSTEM.Might"),
      Speed: game.i18n.localize("CYPHERSYSTEM.Speed"),
      Intellect: game.i18n.localize("CYPHERSYSTEM.Intellect"),
      Pool: game.i18n.localize("CYPHERSYSTEM.AnyPool")
    };

    const matchingSkillItems = sortedItems
      .filter(item => {
        if (item.type !== "skill") return false;
        if (hideArchivedSkills && item.system.archived) return false;

        const itemForm = item.system.settings?.general?.unmaskedForm ?? currentSkillForm;
        return itemForm === currentSkillForm;
      })
      .sort((a, b) => {
        const archiveOrder = Number(Boolean(a.system.archived)) - Number(Boolean(b.system.archived));
        if (archiveOrder) return archiveOrder;

        const favoriteOrder = Number(Boolean(b.system.favorite)) - Number(Boolean(a.system.favorite));
        if (favoriteOrder) return favoriteOrder;

        if (sortSkillsByRating) {
          const ratingOrder =
            (skillRankValues[b.system.basic?.rating] ?? 0) -
            (skillRankValues[a.system.basic?.rating] ?? 0);
          if (ratingOrder) return ratingOrder;
        }

        return (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);
      });

    const preparedSkills = await Promise.all(
      matchingSkillItems.map(async item => {
        const rawRating = item.system.basic?.rating ?? "Practiced";
        const rating = Object.hasOwn(skillRankValues, rawRating) ? rawRating : "Practiced";
        const steps = skillRankValues[rating];
        const pool = item.system.settings?.rollButton?.pool ?? "Pool";
        const assets = Number(item.system.settings?.rollButton?.assets ?? 0);

        return {
          id: item.id,
          archived: Boolean(item.system.archived),
          favorite: Boolean(item.system.favorite),
          name: item.name,
          img: item.img,
          category: item.system.settings?.general?.sorting ?? "Skill",
          rating,
          ratingLabel: game.i18n.localize(`CYPHERSYSTEM.${rating}`),
          ratingTone: rating.toLowerCase(),
          stepsLabel: `${steps > 0 ? "+" : ""}${steps}`,
          poolLabel: skillPoolLabels[pool] ?? titleCase(pool),
          assets: Number.isFinite(assets) ? Math.max(0, Math.trunc(assets)) : 0,
          previewHtml: await buildItemCard(actor, item)
        };
      })
    );

    const skillsByCategory = {
      Skill: [],
      SkillTwo: [],
      SkillThree: [],
      SkillFour: []
    };

    for (const skill of preparedSkills) {
      const category = Object.hasOwn(skillsByCategory, skill.category)
        ? skill.category
        : "Skill";
      skillsByCategory[category].push(skill);
    }

    const skillSettings = system.settings?.skills ?? {};
    const skillCategoryDefinitions = [
      {
        id: "Skill",
        label: skillSettings.labelCategory1 || game.i18n.localize("CYPHERSYSTEM.Skills"),
        configured: true
      },
      {
        id: "SkillTwo",
        label: skillSettings.labelCategory2 || game.i18n.localize("CYPHERSYSTEM.SkillCategoryTwo"),
        configured: Boolean(skillSettings.labelCategory2)
      },
      {
        id: "SkillThree",
        label: skillSettings.labelCategory3 || game.i18n.localize("CYPHERSYSTEM.SkillCategoryThree"),
        configured: Boolean(skillSettings.labelCategory3)
      },
      {
        id: "SkillFour",
        label: skillSettings.labelCategory4 || game.i18n.localize("CYPHERSYSTEM.SkillCategoryFour"),
        configured: Boolean(skillSettings.labelCategory4)
      }
    ];

    const hideEmptySkillCategories = Boolean(system.settings?.general?.hideEmptyCategories);
    const skillCategories = skillCategoryDefinitions
      .filter(category => !isTeen || category.id === "Skill")
      .filter(category =>
        category.id === "Skill" ||
        category.configured ||
        skillsByCategory[category.id].length > 0
      )
      .filter(category =>
        category.id === "Skill" ||
        !hideEmptySkillCategories ||
        skillsByCategory[category.id].length > 0
      )
      .map(category => ({
        id: category.id,
        label: category.label,
        skills: skillsByCategory[category.id],
        count: skillsByCategory[category.id].length
      }));

    const combatAttacks = await Promise.all(
      sortedItems
        .filter(item => item.type === "attack")
        .map(async item => {
          const basic = item.system.basic ?? {};
          const modifier = basic.modifier ?? "";
          const steps = Math.max(0, Number(basic.steps ?? 0));
          const previewHtml = basic.identified === false
            ? ""
            : await buildItemCard(actor, item);

          return {
            id: item.id,
            archived: Boolean(item.system.archived),
            name: item.name,
            img: item.img,
            damage: Number(basic.damage ?? 0),
            type: basic.type ?? "",
            typeLabel: titleCase(basic.type),
            skillRating: basic.skillRating ?? "",
            range: basic.range ?? "",
            notes: basic.notes ?? "",
            modifierLabel: steps > 0
              ? `${titleCase(modifier)} ${steps}`
              : "",
            previewHtml
          };
        })
    );

    const combatArmor = await Promise.all(
      sortedItems
        .filter(item => item.type === "armor")
        .map(async item => {
          const basic = item.system.basic ?? {};
          const defenseSteps = getArmorSteps(basic.type);
          const stepWord = defenseSteps === 1 ? "STEP" : "STEPS";
          const previewHtml = basic.identified === false
            ? ""
            : await buildItemCard(actor, item);

          return {
            id: item.id,
            archived: Boolean(item.system.archived),
            name: item.name,
            img: item.img,
            active: Boolean(item.system.active),
            freelyUse: Boolean(basic.freelyUse),
            type: basic.type ?? "",
            typeLabel: titleCase(basic.type),
            notes: basic.notes ?? "",
            defenseSteps,
            blockEffect: defenseSteps ? `EASED ${defenseSteps} ${stepWord}` : "",
            dodgeEffect: defenseSteps ? `HINDERED ${defenseSteps} ${stepWord}` : "",
            previewHtml
          };
        })
    );

    const armorEnabled = Boolean(
      system.settings?.combat?.armor?.active ||
      system.settings?.equipment?.armor?.active
    );

    const combatAmmo = await Promise.all(
      sortedItems
        .filter(item => item.type === "ammo")
        .map(async item => {
          const basic = item.system.basic ?? {};
          const previewHtml = basic.identified === false ? "" : await buildItemCard(actor, item);
          return {
            id: item.id,
            archived: Boolean(item.system.archived),
            name: item.name,
            img: item.img,
            level: basic.level ?? "",
            quantity: Math.max(0, Number(basic.quantity ?? 0)),
            previewHtml
          };
        })
    );

    const combatLastingDamage = await Promise.all(
      sortedItems
        .filter(item => item.type === "lasting-damage")
        .map(async item => {
          const basic = item.system.basic ?? {};
          const previewHtml = basic.identified === false ? "" : await buildItemCard(actor, item);
          return {
            id: item.id,
            archived: Boolean(item.system.archived),
            name: item.name,
            img: item.img,
            damage: Math.max(0, Number(basic.damage ?? 0)),
            poolLabel: titleCase(basic.pool ?? "Might"),
            typeLabel: titleCase(basic.type ?? "Lasting"),
            effect: basic.effect ?? "",
            previewHtml
          };
        })
    );

    const ammoEnabled = Boolean(
      system.settings?.combat?.ammo?.active ||
      system.settings?.equipment?.ammo?.active
    );

    const lastingDamageEnabled = Boolean(system.settings?.combat?.lastingDamage?.active);

    Object.assign(context, {
      rollSettings: {
        enabled: rollButtons === 1 && canEdit
      },
      rollMode: {
        label: useAllInOne ? "All-in-One" : "Quick Roll",
        cssClass: useAllInOne ? "is-all-in-one" : "is-quick-roll",
        useAllInOne
      },
      abilityCategories,
      preparedSpells,
      skillRanks,
      skillCategories,
      combatAttacks,
      combatArmor,
      armorEnabled,
      combatAmmo,
      combatLastingDamage,
      ammoEnabled,
      lastingDamageEnabled,
      woundRows,
      woundMaxChoices,
      woundHindrance,
      hasWounds,
      recovery,
      actor,
      editable: canEdit,
      canEditStatic,
      staticStatsLocked,
      profile: {
        name: isTeen ? profile.name ?? actor.name : actor.name,
        img: isTeen ? profile.img ?? actor.img : actor.img,
        descriptor,
        type,
        focus,
        sentence,
        additionalSentence: isTeen
          ? ""
          : system.basic?.additionalSentence ?? "",
        nameField: isTeen ? "system.teen.basic.name" : "name",
        descriptorField: isTeen
          ? "system.teen.basic.descriptor"
          : "system.basic.descriptor",
        typeField: isTeen ? "" : "system.basic.type",
        focusField: isTeen ? "" : "system.basic.focus",
        additionalSentenceField: isTeen
          ? ""
          : "system.basic.additionalSentence",
        showType: !isTeen,
        showFocus: !isTeen,
        showAdditionalSentence:
          !isTeen && Boolean(additionalSentenceSettings.active),
        focusLocked:
          !isTeen &&
          system.settings?.general?.gameMode === "Strange"
      },
      progression: {
        tier: Number(system.basic?.tier ?? 0),
        effort: Number(system.basic?.effort ?? 0),
        xp: Number(system.basic?.xp ?? 0),
        tierField: "system.basic.tier",
        effortField: "system.basic.effort",
        xpField: "system.basic.xp"
      },
      pools: [
        makePool("might", game.i18n.localize("CYPHERSYSTEM.Might")),
        makePool("speed", game.i18n.localize("CYPHERSYSTEM.Speed")),
        makePool("intellect", game.i18n.localize("CYPHERSYSTEM.Intellect"))
      ],
      additionalPool
    });

    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    if (this.isEditable) {
      await this._normalizePoolValuesForLastingDamage();
    }

    this._activeTab ??= "overview";
    this._syncTabs();

    // Cypher PC V2 - select full editable field on click
    for (const input of this.element.querySelectorAll(".cypher-v2-edit")) {
      input.addEventListener("click", event => {
        try {
          event.currentTarget.select();
        } catch {
          // Some browser/input combinations do not expose text selection.
        }
      });
    }

    for (const input of this.element.querySelectorAll(".cypher-v2-wound-box")) {
      input.addEventListener("change", event => this._onWoundBoxChange(event));
    }

    for (const select of this.element.querySelectorAll(".cypher-v2-wound-max")) {
      select.addEventListener("change", event => this._onWoundMaxChange(event));
    }

    for (const input of this.element.querySelectorAll(".cypher-v2-pool-current")) {
      input.addEventListener("change", event => this._onPoolValueChange(event));
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      });
    }

    for (const button of this.element.querySelectorAll("[data-pool-action]")) {
      button.addEventListener("click", event => this._onPoolControl(event));
    }

    // Cypher PC V2 - shared Item card previews and Alt archive/delete feedback
    this._cypherV2ItemInteractionAbort?.abort();
    this._cypherV2ItemTooltip?.remove();
    this._cypherV2ItemTooltip = null;

    const itemInteractionAbort = new AbortController();
    this._cypherV2ItemInteractionAbort = itemInteractionAbort;
    const itemInteractionSignal = itemInteractionAbort.signal;

    const setItemAltState = active => {
      this.element?.classList.toggle("cypher-v2-alt-down", Boolean(active));
    };

    setItemAltState(Boolean(game.keyboard?.isModifierActive?.("Alt")));

    window.addEventListener("keydown", keyEvent => {
      if (keyEvent.key === "Alt") setItemAltState(true);
    }, {signal: itemInteractionSignal});

    window.addEventListener("keyup", keyEvent => {
      if (keyEvent.key === "Alt" || !keyEvent.altKey) setItemAltState(false);
    }, {signal: itemInteractionSignal});

    window.addEventListener("blur", () => setItemAltState(false), {
      signal: itemInteractionSignal
    });

    const hideItemTooltip = () => {
      this._cypherV2ItemTooltip?.remove();
      this._cypherV2ItemTooltip = null;
    };

    const showItemTooltip = target => {
      hideItemTooltip();

      const wrapper = target.parentElement;
      const template = wrapper?.querySelector(".cypher-v2-item-tooltip-template");
      if (!(template instanceof HTMLTemplateElement)) return;

      const tooltip = document.createElement("div");
      tooltip.className = "cypher-v2-floating-tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.append(template.content.cloneNode(true));
      document.body.append(tooltip);
      this._cypherV2ItemTooltip = tooltip;

      const targetRect = target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 6;

      let left = targetRect.left;
      if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
        left = window.innerWidth - tooltipRect.width - viewportPadding;
      }
      left = Math.max(viewportPadding, left);

      let top = targetRect.bottom + gap;
      if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
        top = targetRect.top - tooltipRect.height - gap;
      }
      top = Math.max(viewportPadding, top);

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    };

    for (const target of this.element.querySelectorAll("[data-cypher-v2-card-preview]")) {
      target.addEventListener("mouseenter", () => showItemTooltip(target), {
        signal: itemInteractionSignal
      });
      target.addEventListener("mouseleave", hideItemTooltip, {
        signal: itemInteractionSignal
      });
      target.addEventListener("focus", () => showItemTooltip(target), {
        signal: itemInteractionSignal
      });
      target.addEventListener("blur", hideItemTooltip, {
        signal: itemInteractionSignal
      });
    }

    window.addEventListener("scroll", hideItemTooltip, {
      capture: true,
      signal: itemInteractionSignal
    });
    window.addEventListener("resize", hideItemTooltip, {
      signal: itemInteractionSignal
    });
  }

  _syncTabs() {
    const activeTab = this._activeTab ?? "overview";

    for (const panel of this.element.querySelectorAll("[data-cypher-v2-tab-panel]")) {
      panel.hidden = panel.dataset.cypherV2TabPanel !== activeTab;
    }

    for (const button of this.element.querySelectorAll("[data-action='changeTab']")) {
      button.classList.toggle("active", button.dataset.tab === activeTab);
    }
  }

  async _onWoundBoxChange(event) {
    const input = event.currentTarget;
    const woundType = input.dataset.woundType;
    const boxValue = Number(input.dataset.woundValue);

    if (!["minor", "moderate", "major"].includes(woundType)) return;
    if (!Number.isInteger(boxValue) || boxValue < 1 || boxValue > 10) return;

    const newValue = input.checked ? boxValue : boxValue - 1;

    await this.actor.update({
      [`system.combat.wounds.${woundType}.value`]: newValue
    });
  }

  async _onWoundMaxChange(event) {
    const select = event.currentTarget;
    const woundType = select.dataset.woundType;

    if (!["minor", "moderate", "major"].includes(woundType)) return;

    const requestedMax = Number(select.value);
    const newMax = Math.min(
      10,
      Math.max(1, Number.isFinite(requestedMax) ? Math.trunc(requestedMax) : 3)
    );

    const currentValue = Number(
      this.actor.system.combat.wounds?.[woundType]?.value ?? 0
    );
    const newValue = Math.min(Math.max(0, currentValue), newMax);

    await this.actor.update({
      [`system.combat.wounds.${woundType}.max`]: newMax,
      [`system.combat.wounds.${woundType}.value`]: newValue
    });
  }

  _readPoolNumber(field, fallback = 0) {
    const value = Number(foundry.utils.getProperty(this.actor, field));
    return Number.isFinite(value) ? value : fallback;
  }

  _poolNameFromField(field) {
    const match = String(field ?? "").match(
      /^system(?:\.teen)?\.pools\.(might|speed|intellect)\.(?:value|max)$/
    );

    if (!match) return null;

    return {
      might: "Might",
      speed: "Speed",
      intellect: "Intellect"
    }[match[1]];
  }

  _lastingDamageForPool(poolName) {
    if (!["Might", "Speed", "Intellect"].includes(poolName)) return 0;

    return [...this.actor.items]
      .filter(item =>
        item.type === "lasting-damage" &&
        !item.system.archived &&
        item.system.basic?.pool === poolName
      )
      .reduce((total, item) => {
        const damage = Number(item.system.basic?.damage ?? 0);
        return total + (
          Number.isFinite(damage)
            ? Math.max(0, Math.trunc(damage))
            : 0
        );
      }, 0);
  }

  _effectivePoolMax(maxField) {
    const rawMax = this._readPoolNumber(maxField);
    const safeRawMax = Math.max(0, Math.trunc(rawMax || 0));
    const poolName = this._poolNameFromField(maxField);

    if (!poolName) return safeRawMax;
    return Math.max(0, safeRawMax - this._lastingDamageForPool(poolName));
  }

  async _normalizePoolValuesForLastingDamage() {
    const isTeen = this.actor.system.basic?.unmaskedForm === "Teen";
    const basePath = isTeen ? "system.teen.pools" : "system.pools";
    const updates = {};

    for (const key of ["might", "speed", "intellect"]) {
      const valueField = `${basePath}.${key}.value`;
      const maxField = `${basePath}.${key}.max`;
      const current = this._readPoolNumber(valueField);
      const effectiveMax = this._effectivePoolMax(maxField);
      const normalized = this._clampPoolValue(current, effectiveMax);

      if (normalized !== current) {
        updates[valueField] = normalized;
      }
    }

    if (!Object.keys(updates).length) return false;

    await this.actor.update(updates);
    return true;
  }

  _clampPoolValue(value, max) {
    const integer = Math.trunc(Number(value));
    if (!Number.isFinite(integer)) return 0;

    const safeMax = Math.max(0, Math.trunc(Number(max) || 0));
    return Math.min(safeMax, Math.max(0, integer));
  }

  async _onPoolControl(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const action = button.dataset.poolAction;
    const field = button.dataset.field;
    const maxField = button.dataset.maxField;

    if (!field || !maxField) return;

    const current = this._readPoolNumber(field);
    const max = this._effectivePoolMax(maxField);

    let next = current;

    if (action === "decrease") next = current - 1;
    if (action === "increase") next = current + 1;
    if (action === "reset") next = max;

    next = this._clampPoolValue(next, max);

    if (next === current) return;
    await this.actor.update({[field]: next});
  }

  async _onPoolValueChange(event) {
    const input = event.currentTarget;
    const field = input.dataset.field;
    const maxField = input.dataset.maxField;

    if (!field || !maxField) return;

    const current = this._readPoolNumber(field);
    const max = this._effectivePoolMax(maxField);
    const raw = String(input.value ?? "").trim().replace(",", ".");

    if (!raw) {
      input.value = current;
      return;
    }

    let next;

    const relative = raw.match(/^([+\-*/])\s*(\d+(?:\.\d+)?)$/);

    if (relative) {
      const operator = relative[1];
      const operand = Number(relative[2]);

      if (!Number.isFinite(operand) || (operator === "/" && operand === 0)) {
        input.value = current;
        ui.notifications.warn("Pool value: use a number or +2, -2, *2, /2.");
        return;
      }

      if (operator === "+") next = current + operand;
      if (operator === "-") next = current - operand;
      if (operator === "*") next = current * operand;
      if (operator === "/") next = current / operand;
    } else {
      next = Number(raw);
    }

    if (!Number.isFinite(next)) {
      input.value = current;
      ui.notifications.warn("Pool value: use a number or +2, -2, *2, /2.");
      return;
    }

    next = this._clampPoolValue(next, max);
    input.value = next;

    if (next === current) return;
    await this.actor.update({[field]: next});
  }
}
