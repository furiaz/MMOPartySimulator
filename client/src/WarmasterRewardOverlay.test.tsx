import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WarmasterRewardOverlay } from "./WarmasterRewardOverlay";
import { rollWarmasterChest } from "./game/warmasterLifecycleState";

describe("Warmaster reward presentation", () => {
  const actions = { onCollect() {}, onClose() {}, onDeparture() {} };
  it("does not display a closed chest overlay", () => {
    expect(renderToStaticMarkup(<WarmasterRewardOverlay {...actions} open={false} departurePending={false} />)).toBe("");
  });
  it("shows pending rewards and the manual retry/back choices", () => {
    const html = renderToStaticMarkup(<WarmasterRewardOverlay {...actions} chest={rollWarmasterChest(1, () => 0.5)} open departurePending={false} />);
    expect(html).toContain("500 Crowns available");
    expect(html).toContain("Inventory full");
    expect(html).toContain("Collect remaining");
    expect(html).toContain("remaining");
    expect(html).toContain("warmaster-reward-panel");
  });
  it("offers both departure choices instead of silently leaving", () => {
    const html = renderToStaticMarkup(<WarmasterRewardOverlay {...actions} open={false} departurePending />);
    expect(html).toContain("Return to chest");
    expect(html).toContain("Leave anyway");
    expect(html).toContain("arena will remain accessible");
  });
});
