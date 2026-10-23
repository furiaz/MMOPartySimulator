import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import { getItemDefinition } from "./game/items";
import type { WarmasterChest } from "./game/warmasterLifecycleState";

export function WarmasterRewardOverlay({ chest, open, departurePending, onCollect, onClose, onDeparture }: {
  chest?: WarmasterChest;
  open: boolean;
  departurePending: boolean;
  onCollect: () => void;
  onClose: () => void;
  onDeparture: (leave: boolean) => void;
}) {
  if (departurePending) return (
    <section className="dungeon-chest-overlay" role="dialog" aria-modal="true" aria-label="Unclaimed Warmaster rewards">
      <div className="dungeon-chest-panel warmaster-reward-panel">
        <h2>Your chest still has rewards</h2>
        <p>You can return later. The arena will remain accessible until everything is collected.</p>
        <button type="button" onClick={() => onDeparture(false)}>Return to chest</button>{" "}
        <button type="button" onClick={() => onDeparture(true)}>Leave anyway</button>
      </div>
    </section>
  );
  if (!open || !chest) return null;
  return (
    <section className="dungeon-chest-overlay" role="dialog" aria-modal="true" aria-label="Warmaster chest loot">
      <div className="dungeon-chest-panel warmaster-reward-panel">
        <h2>Warmaster's Chest</h2>
        <p>{chest.crownsClaimed ? "500 Crowns collected" : "500 Crowns available"}</p>
        {chest.pendingLoot.length ? <p className="dungeon-chest-warning">Inventory full. Uncollected items stay in the chest.</p> : <p>All rewards collected.</p>}
        <div className="dungeon-chest-grid">
          {chest.collectedLoot.map(slot => <div className="dungeon-chest-slot" key={`collected-${slot.itemId}`}>
            {INVENTORY_ITEM_ICON_SRC[slot.itemId] ? <img alt="" src={INVENTORY_ITEM_ICON_SRC[slot.itemId]} /> : null}
            <span>{getItemDefinition(slot.itemId).displayName}</span><strong>x{slot.quantity} collected</strong>
          </div>)}
          {chest.pendingLoot.map((slot, index) => <div className="dungeon-chest-slot" key={`pending-${slot.itemId}-${index}`}>
            {INVENTORY_ITEM_ICON_SRC[slot.itemId] ? <img alt="" src={INVENTORY_ITEM_ICON_SRC[slot.itemId]} /> : null}
            <span>{getItemDefinition(slot.itemId).displayName}</span><strong>x{slot.quantity} remaining</strong>
          </div>)}
        </div>
        {chest.pendingLoot.length ? <button type="button" onClick={onCollect}>Collect remaining</button> : null}{" "}
        <button className="dungeon-chest-continue" type="button" onClick={onClose}>{chest.pendingLoot.length ? "Back" : "Continue"}</button>
      </div>
    </section>
  );
}
