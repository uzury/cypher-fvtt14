const {HandlebarsApplicationMixin} = foundry.applications.api;
const {ItemSheetV2} = foundry.applications.sheets;

/**
 * ApplicationV2 editor for Cypher 2026 Character Arc Items.
 */
export class CypherCharacterArcItemSheetV2 extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["cyphersystem", "cypher-character-arc-sheet-v2"],
    position: {width: 560, height: 610},
    window: {resizable: true},
    form: {
      closeOnSubmit: false,
      submitOnChange: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/cyphersystem/templates/item-sheets/v2/character-arc-sheet.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const basic = this.item.system.basic ?? {};
    const rawSteps = Number(basic.steps ?? 0);
    const steps = Math.min(
      100,
      Math.max(0, Number.isFinite(rawSteps) ? Math.trunc(rawSteps) : 0)
    );
    const status = basic.status === "completed" ? "completed" : "active";
    const outcome = ["success", "failure"].includes(basic.outcome)
      ? basic.outcome
      : "";
    const descriptionHtml = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.description ?? "",
      {
        async: true,
        secrets: this.item.isOwner,
        relativeTo: this.item
      }
    );

    return Object.assign(context, {
      item: this.item,
      editable: this.isEditable,
      arc: {
        steps,
        status,
        outcome,
        completed: status === "completed",
        completedAt: String(basic.completedAt ?? ""),
        description: String(this.item.system.description ?? ""),
        descriptionHtml,
        statusChoices: {
          active: game.i18n.localize("CYPHERSYSTEM.CharacterArcActive"),
          completed: game.i18n.localize("CYPHERSYSTEM.CharacterArcCompleted")
        },
        outcomeChoices: {
          "": game.i18n.localize("CYPHERSYSTEM.CharacterArcNoOutcome"),
          success: game.i18n.localize("CYPHERSYSTEM.CharacterArcSuccess"),
          failure: game.i18n.localize("CYPHERSYSTEM.CharacterArcFailure")
        }
      }
    });
  }
}
