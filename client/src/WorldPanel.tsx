import {
  debugMapDefinitions,
  HUB_MAP_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
  type DebugMapId,
} from "./game";

const prototypeRegionMapIds: DebugMapId[] = [
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  MAP_THREE_ID,
  MAP_FOUR_ID,
];

export function WorldPanel({
  currentMapId,
  worldTravelTargetMapId,
  onClearRoute,
  onSetRoute,
}: {
  currentMapId?: DebugMapId;
  worldTravelTargetMapId: DebugMapId | null;
  onClearRoute: () => void;
  onSetRoute: (targetMapId: DebugMapId) => void;
}) {
  const activeRouteName = worldTravelTargetMapId
    ? debugMapDefinitions[worldTravelTargetMapId].displayName
    : null;

  return (
    <section className="world-panel" aria-label="World">
      <div className="world-panel-header">
        <h2>World</h2>
        {activeRouteName ? (
          <button onClick={onClearRoute} type="button">
            Clear Route
          </button>
        ) : null}
      </div>
      <div className="world-region">
        <div className="menu-section-heading">
          <strong>Prototype Region</strong>
          {activeRouteName ? <span>Route: {activeRouteName}</span> : null}
        </div>
        <div className="world-map-list">
          {prototypeRegionMapIds.map((mapId) => {
            const mapDefinition = debugMapDefinitions[mapId];
            const isCurrentMap = mapId === currentMapId;
            const isActiveRoute = mapId === worldTravelTargetMapId;
            const actionLabel = isCurrentMap
              ? "Current Map"
              : isActiveRoute
                ? "Route Active"
                : "Set Route";

            return (
              <div className="world-map-row" key={mapId}>
                <div>
                  <strong>{mapDefinition.displayName}</strong>
                  <span>{mapDefinition.debugName}</span>
                </div>
                <button
                  className={isCurrentMap || isActiveRoute ? "active" : ""}
                  disabled={isCurrentMap}
                  onClick={() => onSetRoute(mapId)}
                  type="button"
                >
                  {actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
