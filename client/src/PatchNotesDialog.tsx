import { useEffect, useRef, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import patchNotesMarkdown from "./PATCH_NOTES.md?raw";
import { OverlayPanel } from "./OverlayPanel";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type PatchNotesDialogProps = {
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

export function PatchNotesDialog({
  onClose,
  returnFocusRef,
}: PatchNotesDialogProps) {
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const returnFocusElement = returnFocusRef.current;

    dialogContentRef.current?.scrollTo({ top: 0 });
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        dialogContentRef.current?.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        ) ?? [],
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusElement?.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <OverlayPanel
      ariaLabel="Patch Notes"
      className="patch-notes-dialog"
      onClose={onClose}
    >
      <div ref={dialogContentRef} className="patch-notes-dialog-content">
        <header className="patch-notes-dialog-header">
          <h2>Patch Notes</h2>
          <button ref={closeButtonRef} onClick={onClose} type="button">
            Close
          </button>
        </header>
        <article className="patch-notes-markdown">
          <ReactMarkdown skipHtml>{patchNotesMarkdown}</ReactMarkdown>
        </article>
      </div>
    </OverlayPanel>
  );
}
