import {
  takeGuildNoticeBoardQuest,
  type GuildNoticeBoardTakeResult,
} from "./guildNoticeBoard";
import { recordGuildNoticeBoardQuestTakenForQuests } from "./questProgressionHooks";
import type { GameState } from "./state";

export function takeGuildNoticeBoardQuestForQuests(
  state: GameState,
  nowMs = Date.now(),
  slotIndex?: number,
): GuildNoticeBoardTakeResult {
  const result = takeGuildNoticeBoardQuest(state, nowMs, slotIndex);

  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    state: recordGuildNoticeBoardQuestTakenForQuests(
      result.state,
      result.quest.id,
    ),
  };
}
