import { LEGACY_TEMPLATE } from "./legacy-template.js";

/**
 * Recria os defaults que anteriormente eram montados
 * automaticamente pelo template.json do Foundry.
 *
 * @param {"Actor"|"Item"} documentName
 * @param {string} type
 * @returns {object}
 */
function getLegacyDefaults(documentName, type) {
  const section = LEGACY_TEMPLATE[documentName];
  const definition = section?.[type];

  if (!definition) {
    console.warn(
      `Cypher System | No legacy defaults found for ${documentName}.${type}`
    );

    return {};
  }

  const typeData = foundry.utils.deepClone(definition);
  const templateNames = typeData.templates ?? [];

  delete typeData.templates;

  const defaults = {};

  for (const templateName of templateNames) {
    const template = section.templates?.[templateName];

    if (!template) {
      console.warn(
        `Cypher System | Missing legacy template ${documentName}.${templateName}`
      );

      continue;
    }

    foundry.utils.mergeObject(
      defaults,
      foundry.utils.deepClone(template),
      {
        inplace: true
      }
    );
  }

  return foundry.utils.mergeObject(defaults, typeData, {
    inplace: true
  });
}

export function getLegacyActorDefaults(type) {
  return getLegacyDefaults("Actor", type);
}

export function getLegacyItemDefaults(type) {
  return getLegacyDefaults("Item", type);
}