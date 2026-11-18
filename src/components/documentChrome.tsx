import { useEffect, useState } from "react";
import { FileUp, TriangleAlert, X } from "lucide-react";
import type { CompatIssue } from "../io/compatibility";
import "./documentChrome.css";

/** Slim bar shown after opening a file that uses features MacTuxel can't keep. */
export function CompatibilityBanner({ issues, fileName, onDetails }: { issues: CompatIssue[]; fileName: string; onDetails: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [issues]);
  const removed = issues.filter((i) => i.effect === "removed");
  if (dismissed || removed.length === 0) return null;
  const titles = removed.slice(0, 3).map((i) => i.title.toLowerCase());
  return (
    <div className="banner" role="status" data-testid="compat-banner">
      <TriangleAlert size={15} aria-hidden="true" className="banner__icon" />
      <span className="banner__text">
        <strong>{fileName}</strong> uses features MacTuxel doesn't support ({titles.join(", ")}
        {removed.length > 3 ? ", …" : ""}). They'll be removed if you save.
      </span>
      <button type="button" className="banner__link" onClick={onDetails}>
        Details…
      </button>
      <button type="button" className="banner__close" aria-label="Dismiss" onClick={() => setDismissed(true)}>
        <X size={14} />
      </button>
    </div>
  );
}

/** Full-window target while a file is dragged over MacTuxel. */
export function DropOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="drop-overlay" data-testid="drop-overlay" aria-hidden="true">
      <div className="drop-overlay__card">
        <FileUp size={34} strokeWidth={1.5} />
        <div>Drop to open in MacTuxel</div>
        <small>.xlsx, .xls, .ods, .csv</small>
      </div>
    </div>
  );
}
