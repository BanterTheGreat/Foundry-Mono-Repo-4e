import { SpatialService } from "./spatial-service.js";

/**
 * Builds the narrow Foundry adapter that trigger evaluation reads.
 *
 * Only tokens that are combatants in the active combat are resolvable, which
 * keeps every trigger scoped to the encounter.
 *
 * @param {{combat: Combat, scenes: Map<string, Scene>, getGridSize: (sceneId: string) => number}} sources
 *   Active combat, scene collection, and per-scene grid size lookup.
 * @returns {{
 *   resolveToken: (reference: {sceneId: string|null, tokenId: string|null, actorId?: string|null}) => TokenDocument|null,
 *   combatantTokens: (sceneId: string) => TokenDocument[],
 *   markOwner: (token: TokenDocument) => TokenDocument|null,
 *   areHostile: (left: TokenDocument, right: TokenDocument) => boolean,
 *   areAllied: (left: TokenDocument, right: TokenDocument) => boolean,
 *   distanceSquares: (left: TokenDocument, right: TokenDocument) => number,
 *   doesPathPassAdjacent: (path: object[], mover: TokenDocument, candidate: TokenDocument) => boolean,
 * }}
 */
export function createTriggerServices({ combat, scenes, getGridSize }) {
  const findSceneToken = (sceneId, tokenId) => scenes.get(sceneId)?.tokens.get(tokenId) ?? null;
  const findCombatantByToken = (sceneId, tokenId) => combat.combatants.find(combatant => combatant.sceneId === sceneId && combatant.tokenId === tokenId);
  const spatialFor = token => new SpatialService(getGridSize(token.parent?.id));

  /**
   * Finds the combatant token a reference names, falling back to the first
   * combatant of the referenced actor when the exact token is unknown.
   */
  const resolveToken = (reference, allowNonCombatant = false) => {
    if (allowNonCombatant && (reference.sceneId === combat.scene?.id || combat.combatants.some(entry => entry.sceneId === reference.sceneId))) {
      const token = findSceneToken(reference.sceneId, reference.tokenId);
      if (token) {
        return token;
      }
    }
    const exact = reference.sceneId && reference.tokenId ? findCombatantByToken(reference.sceneId, reference.tokenId) : null;
    const combatant = exact ?? (reference.actorId ? combat.combatants.find(candidate => candidate.actor?.id === reference.actorId) : null);
    return combatant ? findSceneToken(combatant.sceneId, combatant.tokenId) : null;
  };

  return {
    resolveToken,
    combatantTokens: sceneId => combat.combatants
      .filter(combatant => combatant.sceneId === sceneId)
      .map(combatant => findSceneToken(combatant.sceneId, combatant.tokenId))
      .filter(Boolean),
    // DnD4e records the actor applying a Mark at `actor.system.marker`. Prompts
    // are combat events, so only the active combatant for that actor counts.
    markOwner: token => {
      const markerActorUuid = token.actor?.system?.marker;
      const markerCombatant = markerActorUuid ? combat.combatants.find(combatant => combatant.actor?.uuid === markerActorUuid) : null;
      return markerCombatant ? findSceneToken(markerCombatant.sceneId, markerCombatant.tokenId) : null;
    },
    areHostile: (left, right) => left.disposition !== right.disposition,
    areAllied: (left, right) => left.disposition === right.disposition,
    distanceSquares: (left, right) => spatialFor(left).distanceSquares(left, right),
    doesPathEnterRange: (path, mover, candidate, range) => spatialFor(mover).doesPathEnterRange(path, mover, candidate, range),
    doesPathPassAdjacent: (path, mover, candidate) => spatialFor(mover).doesPathPassAdjacent(path, mover, candidate),
  };
}
