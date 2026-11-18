import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, CopyPlus, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useSheetActions } from "../../app/useSheetActions";
import { useSheetController, useSheetState } from "../../spreadsheet/SheetContext";
import { validateSheetName } from "../../spreadsheet/sheetNames";
import type { SheetTab } from "../../spreadsheet/sheetState";
import { ColorPalette } from "../ui/ColorPalette";
import { Menu, MenuHeading, MenuItem, MenuSeparator } from "../ui/Menu";
import { Popover } from "../ui/Popover";
import "./sheettabs.css";

interface MenuState {
  sheetId: string;
  anchor: HTMLElement;
}

/** Worksheet tabs: switch, add, rename (double-click), reorder (drag), and a context menu. */
export function SheetTabs() {
  const controller = useSheetController();
  const { sheets, activeSheetId } = useSheetState();
  const actions = useSheetActions();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  // Keep the active tab in view.
  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>(".sheet-tab.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeSheetId, sheets.length]);

  const index = (id: string) => sheets.findIndex((s) => s.id === id);
  const scrollBy = (dx: number) => scroller.current?.scrollBy({ left: dx, behavior: "smooth" });

  const onDrop = (e: DragEvent, target: SheetTab) => {
    e.preventDefault();
    if (!dragId || dragId === target.id) return;
    void actions.move(index(target.id) - index(dragId), dragId);
    setDragId(null);
  };

  const menuFor = menu ? sheets.find((s) => s.id === menu.sheetId) : null;

  return (
    <div className="sheet-tabs" data-testid="sheet-tabs">
      <div className="sheet-tabs__nav">
        <button type="button" aria-label="Scroll tabs left" data-tip="Scroll tabs left" onMouseDown={(e) => e.preventDefault()} onClick={() => scrollBy(-160)}>
          <ChevronLeft size={14} />
        </button>
        <button type="button" aria-label="Scroll tabs right" data-tip="Scroll tabs right" onMouseDown={(e) => e.preventDefault()} onClick={() => scrollBy(160)}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="sheet-tabs__list" ref={scroller} role="tablist" aria-label="Worksheets">
        {sheets.map((sheet) =>
          renaming === sheet.id ? (
            <RenameField
              key={sheet.id}
              sheet={sheet}
              others={sheets.map((s) => s.name)}
              onDone={(name) => {
                setRenaming(null);
                if (name !== null && controller) controller.renameSheet(sheet.id, name);
                controller?.focusGrid();
              }}
            />
          ) : (
            <button
              key={sheet.id}
              type="button"
              role="tab"
              aria-selected={sheet.id === activeSheetId}
              className={`sheet-tab ${sheet.id === activeSheetId ? "is-active" : ""} ${dragId === sheet.id ? "is-dragging" : ""}`}
              style={sheet.color ? ({ "--tab-color": sheet.color } as React.CSSProperties) : undefined}
              data-sheet-name={sheet.name}
              draggable
              // No preventDefault on mousedown: WebKit would refuse to start the drag.
              // Focus goes back to the grid after the click instead.
              onClick={() => {
                if (sheet.id !== activeSheetId) void actions.activate(sheet.id);
                controller?.focusGrid();
              }}
              onDoubleClick={() => setRenaming(sheet.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ sheetId: sheet.id, anchor: e.currentTarget });
              }}
              onDragStart={(e) => {
                setDragId(sheet.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", sheet.name);
              }}
              onDragOver={(e) => dragId && e.preventDefault()}
              onDrop={(e) => onDrop(e, sheet)}
              onDragEnd={() => {
                setDragId(null);
                controller?.focusGrid();
              }}
            >
              {sheet.name}
            </button>
          ),
        )}
      </div>
      <button
        type="button"
        className="sheet-tabs__add"
        aria-label="New Sheet"
        data-tip="New Sheet"
        data-tip-desc="Insert a worksheet after the current one."
        data-testid="add-sheet"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void actions.add()}
      >
        <Plus size={15} strokeWidth={1.8} />
      </button>
      <button
        ref={moreRef}
        type="button"
        className="sheet-tabs__add"
        aria-label="Sheet Actions"
        aria-haspopup="menu"
        data-tip="Sheet Actions"
        data-tip-desc="Rename, duplicate, move, color or delete the current sheet. Right-click any tab too."
        data-testid="sheet-actions"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => activeSheetId && moreRef.current && setMenu({ sheetId: activeSheetId, anchor: moreRef.current })}
      >
        <Ellipsis size={15} strokeWidth={1.8} />
      </button>

      <Popover anchor={menu?.anchor ?? null} open={!!menuFor} onClose={() => setMenu(null)} placement="top-start" label="Sheet actions">
        {menuFor && (
          <Menu label={`${menuFor.name} actions`}>
            <MenuItem icon={Plus} label="Insert Sheet" onSelect={() => (setMenu(null), void actions.add())} />
            <MenuItem icon={CopyPlus} label="Duplicate" onSelect={() => (setMenu(null), void actions.duplicate(menuFor.id))} />
            <MenuItem icon={Pencil} label="Rename" onSelect={() => (setMenu(null), setRenaming(menuFor.id))} />
            <MenuSeparator />
            <MenuItem icon={ArrowLeft} label="Move Left" disabled={index(menuFor.id) === 0} disabledReason="Already the first sheet." onSelect={() => (setMenu(null), void actions.move(-1, menuFor.id))} />
            <MenuItem icon={ArrowRight} label="Move Right" disabled={index(menuFor.id) === sheets.length - 1} disabledReason="Already the last sheet." onSelect={() => (setMenu(null), void actions.move(1, menuFor.id))} />
            <MenuSeparator />
            <MenuHeading>Tab Color</MenuHeading>
            <ColorPalette resetLabel="No Color" current={menuFor.color} onPick={(color) => (setMenu(null), void actions.setTabColor(color, menuFor.id))} />
            <MenuSeparator />
            <MenuItem
              icon={Trash2}
              label="Delete"
              danger
              disabled={sheets.length < 2}
              disabledReason="A workbook must contain at least one sheet."
              onSelect={() => (setMenu(null), void actions.remove(menuFor.id))}
            />
          </Menu>
        )}
      </Popover>
    </div>
  );
}

function RenameField({ sheet, others, onDone }: { sheet: SheetTab; others: string[]; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(sheet.name);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (name: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(name);
  };

  const submit = () => {
    if (value.trim() === sheet.name) return finish(null);
    const problem = validateSheetName(value, others, sheet.name);
    if (problem) {
      setError(problem);
      ref.current?.focus();
      return;
    }
    finish(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(null);
    }
  };

  return (
    <span className="sheet-tab is-active is-renaming">
      <input
        ref={ref}
        className={`sheet-tab__input ${error ? "has-error" : ""}`}
        aria-label="Sheet name"
        aria-invalid={!!error}
        data-tip={error ? "Can't rename sheet" : undefined}
        data-tip-desc={error ?? undefined}
        title={error ?? undefined}
        value={value}
        size={Math.max(4, value.length)}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => (error ? finish(null) : submit())}
      />
      {error && (
        <span className="sheet-tab__error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
