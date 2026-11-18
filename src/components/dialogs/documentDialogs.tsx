import { AlertTriangle, Info } from "lucide-react";
import type { CompatIssue } from "../../io/compatibility";
import { Dialog } from "../ui/Dialog";
import "./dialogs.css";

export type SaveChoice = "save" | "discard" | "cancel";

/** macOS-style "Do you want to save the changes…?" sheet. */
export function SaveChangesDialog({ name, done }: { name: string; done: (choice: SaveChoice) => void }) {
  return (
    <Dialog
      title={`Do you want to save the changes you made to "${name}"?`}
      onClose={() => done("cancel")}
      width={420}
      footer={
        <>
          <button type="button" className="btn btn--plain" data-testid="dont-save" onClick={() => done("discard")}>
            Don't Save
          </button>
          <span className="dialog__spacer" />
          <button type="button" className="btn" onClick={() => done("cancel")}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" data-testid="save-changes" onClick={() => done("save")}>
            Save
          </button>
        </>
      }
    >
      <p className="dialog__text">Your changes will be lost if you don't save them.</p>
    </Dialog>
  );
}

function IssueList({ issues }: { issues: CompatIssue[] }) {
  const removed = issues.filter((i) => i.effect === "removed");
  const changed = issues.filter((i) => i.effect === "changed");
  const section = (title: string, list: CompatIssue[]) =>
    list.length > 0 && (
      <section className="compat__section">
        <h3>{title}</h3>
        <ul className="compat__list">
          {list.map((i) => (
            <li key={i.id}>
              <strong>{i.title}</strong>
              <span>{i.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="compat" data-testid="compat-issues">
      {section("Will be removed", removed)}
      {section("Will be simplified", changed)}
    </div>
  );
}

/** Warns before writing a file that would lose or simplify features. */
export function CompatibilityWarning({
  issues,
  fileName,
  action,
  done,
}: {
  issues: CompatIssue[];
  fileName: string;
  action: string;
  done: (proceed: boolean) => void;
}) {
  return (
    <Dialog
      title="Some features won't be kept"
      onClose={() => done(false)}
      width={500}
      footer={
        <>
          <button type="button" className="btn" onClick={() => done(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" data-testid="compat-proceed" onClick={() => done(true)}>
            {action}
          </button>
        </>
      }
    >
      <div className="compat__intro">
        <AlertTriangle size={18} aria-hidden="true" className="compat__icon" />
        <p className="dialog__text">
          MacTuxel will write <strong>{fileName}</strong>, but it doesn't support everything in this workbook. Compatibility with Excel isn't
          perfect.
        </p>
      </div>
      <IssueList issues={issues} />
    </Dialog>
  );
}

/** File ▸ Compatibility Report: what the open file contains that MacTuxel can't keep. */
export function CompatibilityReport({ issues, fileName, close }: { issues: CompatIssue[]; fileName: string; close: () => void }) {
  return (
    <Dialog
      title="Compatibility Report"
      onClose={close}
      width={500}
      footer={
        <button type="button" className="btn btn--primary" onClick={close}>
          Done
        </button>
      }
    >
      {issues.length ? (
        <>
          <p className="dialog__text">
            <strong>{fileName}</strong> uses features MacTuxel doesn't support. Your data is open; these items are affected if you save:
          </p>
          <IssueList issues={issues} />
        </>
      ) : (
        <div className="compat__intro">
          <Info size={18} aria-hidden="true" className="compat__icon compat__icon--ok" />
          <p className="dialog__text">No unsupported features were found in {fileName}.</p>
        </div>
      )}
    </Dialog>
  );
}

/** Offered at launch when a previous session ended with unsaved work. */
export function RecoveryDialog({ name, savedAt, done }: { name: string; savedAt: number; done: (restore: boolean) => void }) {
  const when = new Date(savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <Dialog
      title="Recover unsaved changes?"
      onClose={() => done(false)}
      width={440}
      footer={
        <>
          <button type="button" className="btn" data-testid="recovery-discard" onClick={() => done(false)}>
            Discard
          </button>
          <button type="button" className="btn btn--primary" data-testid="recovery-restore" onClick={() => done(true)}>
            Restore
          </button>
        </>
      }
    >
      <p className="dialog__text">
        MacTuxel closed without saving <strong>{name}</strong>. A recovery copy from {when} is available.
      </p>
    </Dialog>
  );
}
