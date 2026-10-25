import { getFormationMemberDepartures } from "./formationAssignments";
import { getSelectedFormationPreset } from "./formationSelection";
import { FORMATION_TRANSITION_MS, getFormationTemplate } from "./formationTemplates";
import { getTravelFormationExpectedPosition, isTravelFormationMember, usesTravelFormation } from "./travelFormation";
import { getCombatFormationPositions, getCombatFormationTarget, isCombatFormationMember } from "./combatFormation";
import { SPATIAL_EPSILON } from "./spatialGeometry";
import { getMovementPositionCommit, getNormalMovementResult, getSpecializedMovementOwner } from "./movementAuthority";
import type { GameState } from "./state";
import type { Companion } from "./types";

/** Inspection never prepares geometry, advances timers, or validates navigation. */
export function getFormationDiagnostics(state: GameState) {
  const assignments = state.formationAssignments, combat = assignments?.combat;
  const leader = state.entities[state.partyLeaderId];
  const valid = assignments?.leaderId === state.partyLeaderId && leader?.kind === "companion" && leader.health > 0 && leader.state !== "dead";
  const travelActive = Boolean(valid && usesTravelFormation(state));
  const combatActive = Boolean(valid && getCombatFormationTarget(state));
  const positions = combatActive && combat ? getCombatFormationPositions(state) : {};
  const template = assignments && getFormationTemplate(assignments.preset, assignments.members.length, assignments.spacing);
  const members = Object.values(state.entities).filter((actor): actor is Companion => actor.kind === "companion")
    .sort((a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id)).map(actor => {
      const slot = template?.slots.find(candidate => candidate.id === assignments?.slotsByEntityId[actor.id]);
      const result = getNormalMovementResult(state, actor.id), commit = getMovementPositionCommit(state, actor.id);
      const travelMember = travelActive && isTravelFormationMember(state, actor);
      const combatMember = combatActive && isCombatFormationMember(state, actor);
      const anchoredLeader = valid && actor.id === state.partyLeaderId && (travelActive || combatActive);
      const expectedPosition = travelMember || (anchoredLeader && travelActive) ? getTravelFormationExpectedPosition(state, actor)
        : combatMember || anchoredLeader ? positions[actor.id] : undefined;
      const candidate = travelMember ? result?.request.travelFormationGoal : combatMember ? result?.request.combatFormationGoal : undefined;
      const goal = expectedPosition && candidate && Math.hypot(candidate.expectedPosition.x - expectedPosition.x,
        candidate.expectedPosition.y - expectedPosition.y) <= SPATIAL_EPSILON ? candidate : undefined;
      const departures = getFormationMemberDepartures(state, actor.id);
      return { entityId: actor.id, slotId: slot?.id, lane: slot?.lane, depth: slot?.depth,
        expectedPosition, acceptedPosition: goal?.position,
        mode: goal?.mode ?? (departures.length ? "departed" : "unavailable"),
        movementOwner: getSpecializedMovementOwner(state, actor.id)?.source ??
          (commit?.source === "normal" ? result?.request.source : commit?.source) ?? result?.request.source,
        departureReasons: departures,
      };
    });
  return { selectedPreset: getSelectedFormationPreset(state), appliedPreset: assignments?.preset,
    transitionProgress: assignments ? Math.min(1, (assignments.transition?.elapsedMs ?? FORMATION_TRANSITION_MS) / FORMATION_TRANSITION_MS) : undefined,
    members };
}

export type FormationDiagnostics = ReturnType<typeof getFormationDiagnostics>;
