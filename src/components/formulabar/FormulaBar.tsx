import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { Check, SquareFunction, X } from "lucide-react";
import { useFormulaBarRef } from "../../app/FormulaBarBridge";
import { useRunCommand } from "../../app/CommandRunner";
import { useSheetController, useSheetState } from "../../spreadsheet/SheetContext";
import { FUNCTION_CATALOG } from "../../spreadsheet/functionCatalog";
import { Menu, MenuItem } from "../ui/Menu";
import { Popover } from "../ui/Popover";
import "./formulabar.css";

/** Name Box: shows the active cell; type a reference + Return to jump there. */
function NameBox() {
  const controller = useSheetController();
  const { nameBox, selectionLabel, selection } = useSheetState();
  const multi = selection.startRow !== selection.endRow || selection.startColumn !== selection.endColumn;
  const [draft, setDraft] = useState(nameBox);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(nameBox);
  }, [nameBox]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const problem = controller?.goTo(draft) ?? null;
      setError(problem);
      if (!problem) {
        e.currentTarget.blur();
        controller?.focusGrid();
      }
    } else if (e.key === "Escape") {
      setDraft(nameBox);
      setError(null);
      e.currentTarget.blur();
      controller?.focusGrid();
    }
  };

  return (
    <div className="namebox">
      <input
        className={`namebox__input ${error ? "has-error" : ""}`}
        aria-label="Name Box"
        aria-invalid={!!error}
        data-testid="name-box"
        data-tip={error ?? "Name Box"}
        data-tip-desc={error ? undefined : multi ? `Selection: ${selectionLabel}. Type a reference like C7 or A1:D10 and press Return.` : "Type a reference like C7 or A1:D10 and press Return."}
        value={draft}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focused.current = false;
          setDraft(nameBox);
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/** Formula bar: edit the active cell's value or formula. Live-syncs with in-cell editing. */
export function FormulaBar() {
  const controller = useSheetController();
  const run = useRunCommand();
  const { cellInput, nameBox } = useSheetState();
  const [draft, setDraft] = useState(cellInput);
  const [editing, setEditing] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const bridge = useFormulaBarRef();

  useEffect(() => {
    if (!editing) setDraft(cellInput);
  }, [cellInput, editing]);

  // Leaving the cell abandons an unfinished formula-bar edit.
  useEffect(() => {
    setEditing(false);
  }, [nameBox]);

  useImperativeHandle(
    bridge,
    () => ({
      edit(text: string) {
        // Text, focus and caret are all set synchronously: a deferred caret move could land
        // after the user has started typing and scramble their input. React's re-render with
        // the same value leaves the caret where it is.
        const el = inputRef.current;
        if (el) {
          el.value = text;
          el.focus();
          el.setSelectionRange(text.length, text.length);
        }
        setEditing(true);
        setDraft(text);
      },
      focus() {
        inputRef.current?.focus();
      },
    }),
    [],
  );

  const commit = () =>
    run("Enter", async () => {
      setEditing(false);
      await controller?.commitCellInput(draft);
      inputRef.current?.blur();
      controller?.focusGrid();
    });

  const cancel = () => {
    setEditing(false);
    setDraft(cellInput);
    inputRef.current?.blur();
    controller?.focusGrid();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div className="formulabar" data-testid="formula-bar">
      <NameBox />
      <div className="formulabar__actions">
        <button
          type="button"
          className="formulabar__btn"
          aria-label="Cancel"
          data-tip="Cancel"
          data-tip-keys="⎋"
          disabled={!editing}
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
        >
          <X size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="formulabar__btn"
          aria-label="Enter"
          data-tip="Enter"
          data-tip-keys="↩"
          disabled={!editing}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void commit()}
        >
          <Check size={14} strokeWidth={1.8} />
        </button>
        <div ref={fxRef}>
          <button
            type="button"
            className="formulabar__btn formulabar__fx"
            aria-label="Insert Function"
            aria-haspopup="menu"
            aria-expanded={fxOpen}
            data-tip="Insert Function"
            data-testid="fx-button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setFxOpen((o) => !o)}
          >
            <SquareFunction size={15} strokeWidth={1.7} />
          </button>
        </div>
        <Popover anchor={fxRef.current} open={fxOpen} onClose={() => setFxOpen(false)} label="Insert function" className="popover--scroll">
          <Menu label="Functions">
            {FUNCTION_CATALOG.map((f) => (
              <MenuItem
                key={f.name}
                label={f.name}
                onSelect={() => {
                  setFxOpen(false);
                  bridge.current?.edit(`=${f.name}(`);
                }}
              >
                <span className="fn-item">
                  <span className="fn-item__name">{f.name}</span>
                  <span className="fn-item__desc">{f.description}</span>
                </span>
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      </div>
      <input
        ref={inputRef}
        className="formulabar__input"
        aria-label="Formula bar"
        data-testid="formula-input"
        spellCheck={false}
        autoComplete="off"
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setEditing(true);
          setDraft(e.target.value);
        }}
        onBlur={() => {
          // Clicking back into the grid without pressing Return discards the draft.
          if (editing) {
            setEditing(false);
            setDraft(cellInput);
          }
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
