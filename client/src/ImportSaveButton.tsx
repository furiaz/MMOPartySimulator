import { useRef } from "react";

type ImportSaveButtonProps = {
  className?: string;
  onImportSaveFile: (file: File) => void | Promise<void>;
};

export function ImportSaveButton({
  className = "",
  onImportSaveFile,
}: ImportSaveButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        className={className}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        Import Save
      </button>
      <input
        ref={inputRef}
        accept="application/json,.json"
        className="import-save-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          event.currentTarget.value = "";

          if (file) {
            void onImportSaveFile(file);
          }
        }}
        tabIndex={-1}
        type="file"
      />
    </>
  );
}
