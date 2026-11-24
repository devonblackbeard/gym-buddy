import { useState } from "react";
import { errorMessage } from "../lib/api";
import { toast } from "../lib/toast";
import { Sheet } from "./Sheet";

interface Props {
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  initial?: string;
  submitLabel: string;
  suggestions?: string[];
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
  /** Shows a destructive button under the form, e.g. "Delete routine". */
  deleteLabel?: string;
  /** Resolve to false to keep the sheet open (e.g. the user cancelled a confirm). */
  onDelete?: () => Promise<boolean>;
}

/** Sheet with a single name field: create or rename a routine / workout. */
export function NameSheet({
  title,
  subtitle,
  label,
  placeholder,
  initial = "",
  submitLabel,
  suggestions = [],
  onSubmit,
  onClose,
  deleteLabel,
  onDelete,
}: Props) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const submit = async (value = trimmed) => {
    if (!value || busy) return;
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (e) {
      toast(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span className="field-label">{label}</span>
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            maxLength={80}
            autoCapitalize="words"
            autoComplete="off"
            enterKeyHint="done"
            autoFocus
          />
        </label>
        {suggestions.length > 0 && (
          <div className="chips">
            {suggestions.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => submit(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-wide" disabled={!trimmed || busy || trimmed === initial}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn btn-danger-text btn-wide"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (await onDelete()) onClose();
                else setBusy(false);
              } catch (e) {
                toast(errorMessage(e));
                setBusy(false);
              }
            }}
          >
            {deleteLabel ?? "Delete"}
          </button>
        )}
      </form>
    </Sheet>
  );
}
