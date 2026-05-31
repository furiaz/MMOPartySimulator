import type { GuidePopupDefinition } from "./guidePopupDefinitions";

type GuidePopupProps = {
  guide: GuidePopupDefinition;
  panelIndex: number;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
};

export function GuidePopup({
  guide,
  panelIndex,
  onBack,
  onNext,
  onClose,
}: GuidePopupProps) {
  const panel = guide.panels[panelIndex] ?? guide.panels[0];
  const isFirstPanel = panelIndex === 0;
  const isLastPanel = panelIndex >= guide.panels.length - 1;

  return (
    <section className="guide-popup-overlay" aria-label={guide.ariaLabel}>
      <div className="guide-popup-panel" role="dialog" aria-modal="true">
        <p className="guide-popup-kicker">
          Guide {panelIndex + 1}/{guide.panels.length}
        </p>
        <h2>{panel.title}</h2>
        <p>{panel.body}</p>
        <div className="guide-popup-actions">
          <button disabled={isFirstPanel} onClick={onBack} type="button">
            Back
          </button>
          {isLastPanel ? (
            <button className="guide-popup-primary-action" onClick={onClose} type="button">
              OK
            </button>
          ) : (
            <button className="guide-popup-primary-action" onClick={onNext} type="button">
              Next
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
