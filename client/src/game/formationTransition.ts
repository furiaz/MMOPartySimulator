import { getCombatFormationTarget } from "./combatFormation";
import { usesTravelFormation } from "./travelFormation";
import { FORMATION_TRANSITION_MS } from "./formationTemplates";
import type { GameState } from "./state";

/** Called once after simulation time advances; all geometry consumers are pure. */
export function advanceFormationTransition(state: GameState): GameState {
  const assignments = state.formationAssignments, transition = assignments?.transition;
  if (!assignments || !transition) return state;
  const key = `${state.simulationFrame ?? state.simulationTick}:${state.simulationTimeMs ?? 0}`;
  if (transition.frameKey === key || (!usesTravelFormation(state) && !getCombatFormationTarget(state))) return state;
  const elapsedMs = Math.min(FORMATION_TRANSITION_MS, transition.elapsedMs + Math.max(0, state.simulationDeltaMs ?? 0));
  return { ...state, formationAssignments: { ...assignments,
    transition: elapsedMs >= FORMATION_TRANSITION_MS ? undefined : { ...transition, elapsedMs, frameKey: key },
    travel: assignments.travel ? { ...assignments.travel, proposedGoalsByEntityId: undefined } : undefined,
    combat: assignments.combat ? { ...assignments.combat, proposedGoalsByEntityId: undefined } : undefined,
  } };
}
