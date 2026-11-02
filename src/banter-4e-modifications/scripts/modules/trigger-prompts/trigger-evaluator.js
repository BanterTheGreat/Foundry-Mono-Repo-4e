import { getEventRoles } from "./combat-events.js";

/**
 * Evaluates one declarative trigger definition against one combat event.
 *
 * The evaluator knows nothing about Foundry: tokens, combatants, relationships,
 * and geometry come from the supplied `services` adapter.
 *
 * @param {object} definition
 *   A definition from `trigger-definitions.js`.
 * @param {object} event
 *   A normalized event from `combat-events.js`.
 * @param {object} services
 *   Adapter built by `trigger-services.js`.
 * @returns {Array<{actor: Actor, sourceName: string, detail: string, distanceSquares?: number}>}
 *   One prompt context per actor that may be prompted; empty when the event
 *   does not qualify.
 */
export function evaluateTriggerDefinition(definition, event, services) {
  if (event.type !== definition.on || !matchesEventFields(definition.where, event)) {
    return [];
  }

  if (definition.damageRequired && !(event.damageTaken > 0)) {
    return [];
  }
  const roles = {};
  const roleReferences = getEventRoles(event);
  const references = Object.values(roleReferences);
  const requiredRoles = new Set([
    ...(definition.companion ? ["target"] : []),
    definition.source, definition.recipients.role, definition.recipients.markOwnerOf,
    ...(definition.recipients.exclude ?? []), ...(definition.rangeBetween ?? []), ...(definition.adjacent ?? []),
    ...(definition.relations ?? []).flatMap(({ left, right }) => [left, right]),
    definition.pathAdjacent?.mover, definition.pathAdjacent?.to,
  ]);
  for (const [role, reference] of Object.entries(roleReferences)) {
    if (!requiredRoles.has(role)) {
      continue;
    }
    const token = services.resolveToken(reference, definition.companion === true && role === "target");
    if (!token) {
      return [];
    }
    roles[role] = token;
  }

  const contexts = [];
  for (const recipient of selectRecipients(definition.recipients, roles, references[0]?.sceneId, services)) {
    if (!recipient.actor) {
      continue;
    }
    const candidateRoles = { ...roles, recipient };
    if (definition.excludesTargetedRecipient && (event.targetIds?.includes(recipient.id) || event.targetIds?.[0] !== event.target?.tokenId)) {
      continue;
    }
    if (definition.adjacent) {
      const distance = services.distanceSquares(candidateRoles[definition.adjacent[0]], candidateRoles[definition.adjacent[1]]);
      if (!(distance > 0 && distance <= 1 + 1e-6)) {
        continue;
      }
    }
    if (!satisfiesRelations(definition.relations, candidateRoles, services)) {
      continue;
    }
    if (definition.pathAdjacent && !(event.opportunityPaths ?? [event.path]).some(path => services.doesPathPassAdjacent(path, candidateRoles[definition.pathAdjacent.mover], candidateRoles[definition.pathAdjacent.to]))) {
      continue;
    }

    const context = {
      actor: recipient.actor,
      attackType: event.attackType,
      isCritical: event.isCritical,
      defenseType: event.defenseType,
      damageTypes: event.damageTypes ?? [],
      requiresCompanion: definition.companion === true,
      companionActorUuid: definition.companion ? `Actor.${roles.target?.actor?.id}` : null,
      ...(definition.pathEntersRange ? { entersRange: range => services.doesPathEnterRange(event.path, roles.mover, recipient, range) } : {}),
      sourceName: candidateRoles[definition.source].name,
      sourceKey: `${candidateRoles[definition.source].parent?.id ?? references[0]?.sceneId}:${candidateRoles[definition.source].id}`,
      detail: renderDetail(definition.detail, candidateRoles, event),
      isMelee: event.isMelee === true,
      isMinion: String(candidateRoles[definition.source].actor?.system?.details?.role?.secondary ?? "").toLowerCase() === "minion",
      adjacent: (() => {
        const distance = services.distanceSquares(recipient, candidateRoles[definition.source]);
        return distance > 0 && distance <= 1 + 1e-6;
      })(),
    };
    if (definition.rangeBetween) {
      const [from, to] = definition.rangeBetween;
      context.distanceSquares = services.distanceSquares(candidateRoles[from], candidateRoles[to]);
    }
    contexts.push(context);
  }
  return contexts;
}

/**
 * Checks an event against a definition's `where` clause.
 *
 * @param {Object<string, *>|undefined} where
 * @param {object} event
 * @returns {boolean}
 */
function matchesEventFields(where, event) {
  return Object.entries(where ?? {}).every(([field, expected]) => Array.isArray(expected) ? expected.includes(event[field]) : event[field] === expected);
}

/**
 * Resolves a definition's `recipients` clause to candidate tokens.
 *
 * @param {object} recipients
 * @param {Object<string, TokenDocument>} roles
 * @param {string|null|undefined} sceneId
 *   Scene shared by the event's tokens; bounds "every combatant" searches.
 * @param {object} services
 * @returns {TokenDocument[]}
 */
function selectRecipients(recipients, roles, sceneId, services) {
  if (recipients.role) {
    return roles[recipients.role] ? [roles[recipients.role]] : [];
  }
  if (recipients.markOwnerOf) {
    const owner = services.markOwner(roles[recipients.markOwnerOf]);
    return owner ? [owner] : [];
  }
  if (recipients.combatants) {
    const excludedIds = new Set((recipients.exclude ?? []).map(role => roles[role].id));
    return services.combatantTokens(sceneId).filter(token => !excludedIds.has(token.id));
  }
  return [];
}

/**
 * Checks a definition's `relations` between role tokens.
 *
 * @param {Array<{left: string, relation: string, right: string}>|undefined} relations
 * @param {Object<string, TokenDocument>} roles
 * @param {object} services
 * @returns {boolean}
 */
function satisfiesRelations(relations, roles, services) {
  return (relations ?? []).every(({ left, relation, right }) => {
    const leftToken = roles[left];
    const rightToken = roles[right];
    switch (relation) {
      case "hostile":
        return services.areHostile(leftToken, rightToken);
      case "allied":
        return services.areAllied(leftToken, rightToken);
      case "distinct":
        return leftToken.id !== rightToken.id;
      default:
        return false;
    }
  });
}

/**
 * Fills `{role}` and `{defense}` placeholders with token and event data.
 *
 * @param {string} template
 * @param {Object<string, TokenDocument>} roles
 * @param {object} event
 * @returns {string}
 */
function renderDetail(template, roles, event) {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (name === "defense") {
      return event.defenseType?.toUpperCase() ?? "defense";
    }
    return roles[name]?.name ?? match;
  });
}
