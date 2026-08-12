const RED_TYPES = new Set([
  "attack",
  "skill",
  "cypher",
  "artifact",
  "oddity",
  "material",
  "ability",
  "power-shift",
  "lasting-damage"
]);

const GRAY_TYPES = new Set([
  "equipment",
  "armor",
  "ammo"
]);

function escapeChatText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainText(htmlString) {
  return String(htmlString ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bodyHTML(htmlString) {
  const raw = String(htmlString ?? "");
  const hrMatch = raw.match(/<hr\b[^>]*>/i);
  let body = raw;

  if (hrMatch && hrMatch.index !== undefined) {
    body = raw.slice(hrMatch.index + hrMatch[0].length);
  }

  body = body.replace(
    /<img[^>]*class=["'][^"']*description-image-chat[^"']*["'][^>]*>/gi,
    ""
  );

  return body.trim();
}

function extractImageSource(htmlString) {
  const match = String(htmlString ?? "").match(
    /<img[^>]+src=["']([^"']+)["'][^>]*>/i
  );
  return match ? match[1] : "";
}

function normalizeType(typeText) {
  const normalized = String(typeText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes("power-shift") || normalized.includes("power shift")) return "power-shift";
  if (normalized.includes("lasting-damage") || normalized.includes("lasting damage")) return "lasting-damage";
  if (normalized.includes("attack")) return "attack";
  if (normalized.includes("skill")) return "skill";
  if (normalized.includes("artifact")) return "artifact";
  if (normalized.includes("cypher")) return "cypher";
  if (normalized.includes("oddity")) return "oddity";
  if (normalized.includes("ammo")) return "ammo";
  if (normalized.includes("armor")) return "armor";
  if (normalized.includes("equip")) return "equipment";
  if (normalized.includes("ability") || normalized.includes("spell")) return "ability";

  if (
    normalized.includes("material") ||
    normalized.includes("iotum") ||
    normalized.includes("part") ||
    normalized.includes("scrap")
  ) {
    return "material";
  }

  return "";
}

function inferTypeFromBody(bodyText) {
  const text = String(bodyText ?? "").toLowerCase();

  if (text.includes("depletion:")) return "artifact";

  const hasLevel = text.includes("level:");
  const hasForm = text.includes("form:");
  const hasEffect = text.includes("effect:");

  if (hasLevel && hasForm && hasEffect) return "cypher";
  return "";
}

function parseLegacyCardData(htmlString) {
  const raw = String(htmlString ?? "");
  const hrMatch = raw.match(/<hr\b[^>]*>/i);
  const headerHTML =
    hrMatch && hrMatch.index !== undefined
      ? raw.slice(0, hrMatch.index)
      : raw;

  const body = bodyHTML(raw);
  const headerText = plainText(headerHTML);
  const titleMatch = headerText.match(/^([^:]+):\s*(.+)$/);

  if (!titleMatch) return null;

  const rawType = titleMatch[1].trim();
  const normalizedType =
    normalizeType(rawType) ||
    inferTypeFromBody(plainText(body));

  let remaining = titleMatch[2].trim();
  let meta = "";

  const parenMatch = remaining.match(/^(.*)\(([^()]*)\)\s*$/);
  if (parenMatch) {
    remaining = parenMatch[1].trim();
    meta = parenMatch[2].trim();
  }

  return {
    type: normalizedType,
    sourceTypeLabel: rawType,
    name: remaining,
    meta,
    icon: extractImageSource(raw),
    bodyHTML: body
  };
}

function resolveFlaggedDocuments(message) {
  const flags = message.flags?.cyphersystem ?? {};

  let item = null;
  let actor = null;

  if (flags.itemUuid) {
    item = foundry.utils.fromUuidSync(flags.itemUuid) ?? null;
  }

  if (item?.parent?.documentName === "Actor") {
    actor = item.parent;
  }

  if (!actor && flags.actorUuid) {
    actor = foundry.utils.fromUuidSync(flags.actorUuid) ?? null;
  }

  if (!actor && message.speaker?.actor) {
    actor = game.actors?.get(message.speaker.actor) ?? null;
  }

  if (!item && actor && flags.itemId) {
    item = actor.items?.get(flags.itemId) ?? null;
  }

  return {actor, item};
}

function resolvePlayerName(message) {
  const userId =
    message.author?.id ??
    message.user?.id ??
    message.user ??
    null;

  return (
    message.author?.name ??
    game.users?.get(userId)?.name ??
    message.speaker?.alias ??
    "Player"
  );
}

function resolveConfiguredTypeLabel(parsed, actor, item) {
  const itemType = item?.type ?? parsed.type;
  const equipmentSettings = actor?.system?.settings?.equipment ?? {};
  const skillSettings = actor?.system?.settings?.skills ?? {};

  switch (itemType) {
    case "material":
      return equipmentSettings.materials?.label?.trim() || parsed.sourceTypeLabel;
    case "oddity":
      return equipmentSettings.oddities?.label?.trim() || parsed.sourceTypeLabel;
    case "artifact":
      return equipmentSettings.artifacts?.label?.trim() || parsed.sourceTypeLabel;
    case "cypher":
      return equipmentSettings.cyphers?.label?.trim() || parsed.sourceTypeLabel;
    case "power-shift":
      return skillSettings.powerShifts?.label?.trim() || parsed.sourceTypeLabel;
    default:
      return parsed.sourceTypeLabel;
  }
}

function buildItemCard(parsed, actor, item, message) {
  const itemType = item?.type ?? parsed.type;

  if (!RED_TYPES.has(itemType) && !GRAY_TYPES.has(itemType)) {
    return null;
  }

  const accentClass = GRAY_TYPES.has(itemType)
    ? "cypher-item-accent-gray"
    : "cypher-item-accent-red";

  const actorName = escapeChatText(
    actor?.name ?? message.speaker?.alias ?? "Character"
  );
  const actorAvatar = escapeChatText(
    actor?.img ?? "icons/svg/mystery-man.svg"
  );
  const playerName = escapeChatText(resolvePlayerName(message));
  const itemName = escapeChatText(item?.name ?? parsed.name);
  const typeLabel = escapeChatText(
    resolveConfiguredTypeLabel(parsed, actor, item)
  );
  const meta = escapeChatText(parsed.meta);

  const icon = escapeChatText(
    item?.img ??
    parsed.icon ??
    "icons/svg/item-bag.svg"
  );

  return `
    <div class="cypher-item-card ${accentClass}">
      <div class="cypher-item-identity">
        <div class="cypher-item-identity-left">
          <img class="cypher-item-avatar" src="${actorAvatar}" alt="${actorName}">
          <div class="cypher-item-identity-text">
            <span class="cypher-item-character-name">${actorName}</span>
            <span class="cypher-item-player-name">(${playerName})</span>
          </div>
        </div>

        <img
          class="cypher-item-source-icon"
          src="${icon}"
          alt="${itemName}"
          title="${itemName}"
        >
      </div>

      <div class="cypher-item-heading">
        <div class="cypher-item-heading-text">
          <div class="cypher-item-type">${typeLabel}</div>
          <div class="cypher-item-name">${itemName}</div>
          ${meta ? `<div class="cypher-item-meta">${meta}</div>` : ""}
        </div>
      </div>

      <div class="cypher-item-divider"></div>

      <div class="cypher-item-body">
        ${parsed.bodyHTML}
      </div>
    </div>
  `;
}

function buildSpellRecoveryCard(message, actor, item) {
  const actorName = escapeChatText(
    actor?.name ?? message.speaker?.alias ?? "Character"
  );
  const actorAvatar = escapeChatText(
    actor?.img ?? "icons/svg/mystery-man.svg"
  );
  const playerName = escapeChatText(resolvePlayerName(message));
  const itemName = escapeChatText(
    item?.name ?? game.i18n.localize("CYPHERSYSTEM.Spell")
  );
  const itemIcon = escapeChatText(item?.img ?? "icons/svg/book.svg");

  const configuredSpellLabel =
    actor?.system?.settings?.abilities?.labelSpells?.trim() ||
    game.i18n.localize("CYPHERSYSTEM.Spells");

  return `
    <div class="cypher-spell-recovery-card">
      <div class="cypher-spell-recovery-identity">
        <div class="cypher-spell-recovery-identity-left">
          <img class="cypher-spell-recovery-avatar" src="${actorAvatar}" alt="${actorName}">
          <div class="cypher-spell-recovery-identity-text">
            <span class="cypher-spell-recovery-character-name">${actorName}</span>
            <span class="cypher-spell-recovery-player-name">(${playerName})</span>
          </div>
        </div>

        <img
          class="cypher-spell-recovery-source-icon"
          src="${itemIcon}"
          alt="${itemName}"
          title="${itemName}"
        >
      </div>

      <div class="cypher-spell-recovery-heading">
        <div class="cypher-spell-recovery-category">${escapeChatText(configuredSpellLabel)}</div>
        <div class="cypher-spell-recovery-title">${itemName}</div>
        <div class="cypher-spell-recovery-divider"></div>
        <div class="cypher-spell-recovery-subtitle">
          ${escapeChatText(game.i18n.localize("CYPHERSYSTEM.CastSpell"))}
        </div>
      </div>

      <div class="cypher-spell-recovery-description">
        ${message.content}
      </div>
    </div>
  `;
}

export function decorateCypherChatMessage(message, html) {
  const messageContent = html.find(".message-content");
  if (!messageContent.length) return;

  if (
    messageContent.find(
      ".cypher-roll-card, .cypher-recovery-card, .cypher-item-card, .cypher-spell-recovery-card"
    ).length
  ) {
    return;
  }

  const {actor, item} = resolveFlaggedDocuments(message);
  const cardType = message.flags?.cyphersystem?.cardType;

  if (cardType === "spell-recovery") {
    messageContent.html(buildSpellRecoveryCard(message, actor, item));
    return;
  }

  const parsed = parseLegacyCardData(messageContent.html());
  if (!parsed) return;

  const card = buildItemCard(parsed, actor, item, message);
  if (!card) return;

  messageContent.html(card);
}
