import {
  AArrowDown,
  AArrowUp,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownAZ,
  ArrowDownToLine,
  ArrowRightToLine,
  Baseline,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Bold,
  ClipboardPaste,
  Copy,
  DecimalsArrowLeft,
  DecimalsArrowRight,
  DollarSign,
  Eraser,
  Grid2x2,
  Hash,
  Highlighter,
  Italic,
  ListIndentDecrease,
  ListIndentIncrease,
  PaintBucket,
  Paintbrush,
  Palette,
  Percent,
  RotateCw,
  Scissors,
  Search,
  Sigma,
  Strikethrough,
  Table,
  TableCellsMerge,
  TableCellsSplit,
  TableProperties,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  TextWrap,
  Type,
  Trash2,
  Underline,
} from "lucide-react";
import { useRunCommand } from "../../../app/CommandRunner";
import { useSheetActions } from "../../../app/useSheetActions";
import { useSheetController, useSheetState } from "../../../spreadsheet/SheetContext";
import type { AggregateFunction } from "../../../spreadsheet/autoSum";
import { CommaStyleIcon } from "../../icons/CustomIcons";
import { useDialogs } from "../../ui/DialogProvider";
import { ColorPalette } from "../../ui/ColorPalette";
import { Menu, MenuHeading, MenuItem, MenuSeparator } from "../../ui/Menu";
import { CELL_STYLES } from "../cellStyles";
import { ColorButton } from "../ColorButton";
import { FontFamilyPicker, FontSizeBox, NumberFormatSelect } from "../controls";
import { RibbonButton } from "../RibbonButton";
import { RibbonGroup, RibbonRow, RibbonSegment, RibbonStack } from "../RibbonGroup";

const NO_PLUGIN = "This feature isn't included in MacTuxel yet.";

export function HomeTab() {
  return (
    <>
      <ClipboardGroup />
      <FontGroup />
      <AlignmentGroup />
      <NumberGroup />
      <StylesGroup />
      <CellsGroup />
      <EditingGroup />
    </>
  );
}

function ClipboardGroup() {
  const c = useSheetController();
  const { painting } = useSheetState();
  return (
    <RibbonGroup label="Clipboard" icon={ClipboardPaste}>
      <RibbonButton icon={ClipboardPaste} label="Paste" size="large" keys="⌘V" desc="Paste the clipboard into the selection." onClick={() => c?.paste()} testId="cmd-paste" />
      <RibbonStack>
        <RibbonButton icon={Scissors} label="Cut" keys="⌘X" desc="Move the selection to the clipboard." onClick={() => c?.cut()} testId="cmd-cut" />
        <RibbonButton icon={Copy} label="Copy" keys="⌘C" desc="Copy the selection to the clipboard." onClick={() => c?.copy()} testId="cmd-copy" />
        <RibbonButton icon={Paintbrush} label="Format Painter" desc="Copy formatting from the selection, then select the cells to apply it to. Esc cancels." active={painting} onClick={() => c?.formatPainter()} testId="cmd-format-painter" />
      </RibbonStack>
    </RibbonGroup>
  );
}

function FontGroup() {
  const c = useSheetController();
  const run = useRunCommand();
  const { style } = useSheetState();
  return (
    <RibbonGroup label="Font" icon={Type}>
      <RibbonStack>
        <RibbonRow>
          <FontFamilyPicker />
          <FontSizeBox />
          <RibbonButton icon={AArrowUp} label="Increase Font Size" size="icon" keys="⇧⌘." onClick={() => c?.growFont()} testId="cmd-grow-font" />
          <RibbonButton icon={AArrowDown} label="Decrease Font Size" size="icon" keys="⇧⌘," onClick={() => c?.shrinkFont()} testId="cmd-shrink-font" />
        </RibbonRow>
        <RibbonRow>
          <RibbonSegment>
            <RibbonButton icon={Bold} label="Bold" size="icon" keys="⌘B" active={style.bold} onClick={() => c?.toggleBold()} testId="cmd-bold" />
            <RibbonButton icon={Italic} label="Italic" size="icon" keys="⌘I" active={style.italic} onClick={() => c?.toggleItalic()} testId="cmd-italic" />
            <RibbonButton icon={Underline} label="Underline" size="icon" keys="⌘U" active={style.underline} onClick={() => c?.toggleUnderline()} testId="cmd-underline" />
            <RibbonButton icon={Strikethrough} label="Strikethrough" size="icon" keys="⇧⌘X" active={style.strikethrough} onClick={() => c?.toggleStrikethrough()} testId="cmd-strike" />
          </RibbonSegment>
          <RibbonButton
            icon={Grid2x2}
            label="Borders"
            size="icon"
            desc="Add borders to the selected cells."
            testId="cmd-borders"
            menu={(close) => (
              <Menu label="Borders">
                {(
                  [
                    ["all", "All Borders"],
                    ["outside", "Outside Borders"],
                    ["thick-outside", "Thick Outside Borders"],
                    ["inside", "Inside Borders"],
                    ["top", "Top Border"],
                    ["bottom", "Bottom Border"],
                    ["left", "Left Border"],
                    ["right", "Right Border"],
                  ] as const
                ).map(([id, label]) => (
                  <MenuItem key={id} label={label} onSelect={() => (close(), void run(label, () => c?.setBorders(id)))} />
                ))}
                <MenuSeparator />
                <MenuItem label="No Border" onSelect={() => (close(), void run("No Border", () => c?.setBorders("none")))} />
              </Menu>
            )}
          />
          <ColorButton
            icon={PaintBucket}
            label="Fill Color"
            desc="Color the background of the selected cells."
            resetLabel="No Fill"
            initialColor="#fde68a"
            current={style.background}
            apply={(color) => run("Fill Color", () => c?.setFillColor(color))}
            testId="cmd-fill"
          />
          <ColorButton
            icon={Baseline}
            label="Font Color"
            desc="Change the text color."
            resetLabel="Automatic"
            initialColor="#dc2626"
            current={style.fontColor}
            apply={(color) => run("Font Color", () => c?.setFontColor(color))}
            testId="cmd-font-color"
          />
        </RibbonRow>
      </RibbonStack>
    </RibbonGroup>
  );
}

function AlignmentGroup() {
  const c = useSheetController();
  const run = useRunCommand();
  const { style, merged } = useSheetState();
  return (
    <RibbonGroup label="Alignment" icon={TextAlignStart}>
      <RibbonStack>
        <RibbonRow>
          <RibbonSegment>
            <RibbonButton icon={AlignVerticalJustifyStart} label="Top Align" size="icon" active={style.vAlign === "top"} onClick={() => c?.setVerticalAlign("top")} testId="cmd-valign-top" />
            <RibbonButton icon={AlignVerticalJustifyCenter} label="Middle Align" size="icon" active={style.vAlign === "middle"} onClick={() => c?.setVerticalAlign("middle")} testId="cmd-valign-middle" />
            <RibbonButton icon={AlignVerticalJustifyEnd} label="Bottom Align" size="icon" active={style.vAlign === "bottom"} onClick={() => c?.setVerticalAlign("bottom")} testId="cmd-valign-bottom" />
          </RibbonSegment>
          <RibbonButton
            icon={RotateCw}
            label="Orientation"
            size="icon"
            desc="Rotate text in the selected cells."
            testId="cmd-orientation"
            menu={(close) => (
              <Menu label="Orientation">
                {(
                  [
                    // Univer's convention: negative = counterclockwise (text tilts up).
                    [-45, "Angle Counterclockwise"],
                    [45, "Angle Clockwise"],
                    [-90, "Rotate Text Up"],
                    [90, "Rotate Text Down"],
                    [0, "No Rotation"],
                  ] as const
                ).map(([deg, label]) => (
                  <MenuItem key={deg} label={label} checked={style.rotation === deg} onSelect={() => (close(), void run(label, () => c?.setRotation(deg)))} />
                ))}
              </Menu>
            )}
          />
          <RibbonButton icon={TextWrap} label="Wrap Text" active={style.wrap} desc="Show long text on multiple lines." onClick={() => c?.toggleWrap()} testId="cmd-wrap" />
        </RibbonRow>
        <RibbonRow>
          <RibbonSegment>
            <RibbonButton icon={TextAlignStart} label="Align Left" size="icon" active={style.hAlign === "left"} onClick={() => c?.setHorizontalAlign("left")} testId="cmd-align-left" />
            <RibbonButton icon={TextAlignCenter} label="Center" size="icon" active={style.hAlign === "center"} onClick={() => c?.setHorizontalAlign("center")} testId="cmd-align-center" />
            <RibbonButton icon={TextAlignEnd} label="Align Right" size="icon" active={style.hAlign === "right"} onClick={() => c?.setHorizontalAlign("right")} testId="cmd-align-right" />
          </RibbonSegment>
          <RibbonSegment>
            <RibbonButton icon={ListIndentDecrease} label="Decrease Indent" size="icon" disabled disabledReason={NO_PLUGIN} />
            <RibbonButton icon={ListIndentIncrease} label="Increase Indent" size="icon" disabled disabledReason={NO_PLUGIN} />
          </RibbonSegment>
          <RibbonButton
            icon={TableCellsMerge}
            label="Merge & Center"
            active={merged}
            desc="Combine the selected cells into one larger cell and center its contents."
            onClick={() => c?.merge(merged ? "unmerge" : "center")}
            testId="cmd-merge"
            splitMenu={(close) => (
              <Menu label="Merge">
                <MenuItem icon={TableCellsMerge} label="Merge & Center" onSelect={() => (close(), void run("Merge & Center", () => c?.merge("center")))} />
                <MenuItem label="Merge Across" onSelect={() => (close(), void run("Merge Across", () => c?.merge("across")))} />
                <MenuItem label="Merge Cells" onSelect={() => (close(), void run("Merge Cells", () => c?.merge("cells")))} />
                <MenuItem icon={TableCellsSplit} label="Unmerge Cells" onSelect={() => (close(), void run("Unmerge Cells", () => c?.merge("unmerge")))} />
              </Menu>
            )}
          />
        </RibbonRow>
      </RibbonStack>
    </RibbonGroup>
  );
}

function NumberGroup() {
  const c = useSheetController();
  return (
    <RibbonGroup label="Number" icon={Hash}>
      <RibbonStack>
        <RibbonRow>
          <NumberFormatSelect />
        </RibbonRow>
        <RibbonRow>
          <RibbonSegment>
            <RibbonButton icon={DollarSign} label="Currency" size="icon" desc="Format as currency." onClick={() => c?.currencyFormat()} testId="cmd-currency" />
            <RibbonButton icon={Percent} label="Percent Style" size="icon" keys="⇧⌘%" onClick={() => c?.percentFormat()} testId="cmd-percent" />
            <RibbonButton icon={CommaStyleIcon} label="Comma Style" size="icon" desc="Show thousands separators and two decimals." onClick={() => c?.commaFormat()} testId="cmd-comma" />
          </RibbonSegment>
          <RibbonSegment>
            <RibbonButton icon={DecimalsArrowRight} label="Increase Decimal" size="icon" desc="Show more decimal places." onClick={() => c?.increaseDecimals()} testId="cmd-inc-decimal" />
            <RibbonButton icon={DecimalsArrowLeft} label="Decrease Decimal" size="icon" desc="Show fewer decimal places." onClick={() => c?.decreaseDecimals()} testId="cmd-dec-decimal" />
          </RibbonSegment>
        </RibbonRow>
      </RibbonStack>
    </RibbonGroup>
  );
}

function StylesGroup() {
  const c = useSheetController();
  const run = useRunCommand();
  return (
    <RibbonGroup label="Styles" icon={Palette}>
      <RibbonButton icon={Highlighter} label="Conditional Formatting" size="large" disabled disabledReason={NO_PLUGIN} />
      <RibbonButton icon={Table} label="Format as Table" size="large" disabled disabledReason={NO_PLUGIN} />
      <RibbonButton
        icon={Palette}
        label="Cell Styles"
        size="large"
        desc="Apply a predefined style to the selected cells."
        testId="cmd-cell-styles"
        menu={(close) => (
          <div className="style-gallery" role="menu" aria-label="Cell styles">
            {CELL_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                className="style-gallery__item"
                data-style={s.id}
                style={{
                  background: s.background ?? undefined,
                  color: s.color ?? undefined,
                  fontWeight: s.bold ? 700 : undefined,
                  fontStyle: s.italic ? "italic" : undefined,
                  borderBottom: s.border === "bottom-thick" ? `3px solid ${s.color ?? "#0f766e"}` : s.border === "top-double" ? "3px double currentColor" : undefined,
                  borderTop: s.border === "top-double" ? "1px solid currentColor" : undefined,
                }}
                onClick={() => {
                  close();
                  void run(s.label, () => c?.applyCellStyle(s));
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      />
    </RibbonGroup>
  );
}

function CellsGroup() {
  const c = useSheetController();
  const run = useRunCommand();
  const dialogs = useDialogs();
  const sheets = useSheetActions();
  const { sheets: tabs } = useSheetState();

  const promptSize = async (kind: "row" | "column") => {
    if (!c) return;
    const isRow = kind === "row";
    const value = await dialogs.prompt({
      title: isRow ? "Row Height" : "Column Width",
      label: isRow ? "Row height (points)" : "Column width (pixels)",
      initialValue: String(Math.round(isRow ? c.currentRowHeight() : c.currentColumnWidth())),
      inputType: "number",
      min: 1,
      max: isRow ? 409 : 2000,
      validate: (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 1 && n <= (isRow ? 409 : 2000) ? null : `Enter a number between 1 and ${isRow ? 409 : 2000}.`;
      },
    });
    if (value !== null) await run(isRow ? "Row Height" : "Column Width", () => (isRow ? c.setRowHeight(Number(value)) : c.setColumnWidth(Number(value))));
    c.focusGrid();
  };

  return (
    <RibbonGroup label="Cells" icon={TableProperties}>
      <RibbonButton
        icon={BetweenHorizontalStart}
        label="Insert"
        size="large"
        desc="Insert cells, rows, columns or a sheet."
        testId="cmd-insert"
        menu={(close) => (
          <Menu label="Insert">
            <MenuItem label="Insert Cells (Shift Down)" onSelect={() => (close(), void run("Insert Cells", () => c?.insertCells("down")))} />
            <MenuItem label="Insert Cells (Shift Right)" onSelect={() => (close(), void run("Insert Cells", () => c?.insertCells("right")))} />
            <MenuSeparator />
            <MenuItem icon={BetweenHorizontalStart} label="Insert Sheet Rows" onSelect={() => (close(), void run("Insert Rows", () => c?.insertRows()))} />
            <MenuItem icon={BetweenVerticalStart} label="Insert Sheet Columns" onSelect={() => (close(), void run("Insert Columns", () => c?.insertColumns()))} />
            <MenuSeparator />
            <MenuItem label="Insert Sheet" onSelect={() => (close(), void sheets.add())} />
          </Menu>
        )}
      />
      <RibbonButton
        icon={Trash2}
        label="Delete"
        size="large"
        desc="Delete cells, rows, columns or a sheet."
        testId="cmd-delete"
        menu={(close) => (
          <Menu label="Delete">
            <MenuItem label="Delete Cells (Shift Up)" onSelect={() => (close(), void run("Delete Cells", () => c?.deleteCells("up")))} />
            <MenuItem label="Delete Cells (Shift Left)" onSelect={() => (close(), void run("Delete Cells", () => c?.deleteCells("left")))} />
            <MenuSeparator />
            <MenuItem label="Delete Sheet Rows" onSelect={() => (close(), void run("Delete Rows", () => c?.deleteRows()))} />
            <MenuItem label="Delete Sheet Columns" onSelect={() => (close(), void run("Delete Columns", () => c?.deleteColumns()))} />
            <MenuSeparator />
            <MenuItem label="Delete Sheet" danger disabled={tabs.length < 2} disabledReason="A workbook must contain at least one sheet." onSelect={() => (close(), void sheets.remove())} />
          </Menu>
        )}
      />
      <RibbonButton
        icon={TableProperties}
        label="Format"
        size="large"
        desc="Row height, column width, visibility and sheet options."
        testId="cmd-format"
        menu={(close) => (
          <Menu label="Format">
            <MenuHeading>Cell Size</MenuHeading>
            <MenuItem label="Row Height…" onSelect={() => (close(), void promptSize("row"))} />
            <MenuItem label="AutoFit Row Height" onSelect={() => (close(), void run("AutoFit Row Height", () => c?.autoFitRows()))} />
            <MenuItem label="Column Width…" onSelect={() => (close(), void promptSize("column"))} />
            <MenuItem label="AutoFit Column Width" onSelect={() => (close(), void run("AutoFit Column Width", () => c?.autoFitColumns()))} />
            <MenuSeparator />
            <MenuHeading>Visibility</MenuHeading>
            <MenuItem label="Hide Rows" onSelect={() => (close(), void run("Hide Rows", () => c?.setRowsHidden(true)))} />
            <MenuItem label="Hide Columns" onSelect={() => (close(), void run("Hide Columns", () => c?.setColumnsHidden(true)))} />
            <MenuItem label="Unhide Rows" onSelect={() => (close(), void run("Unhide Rows", () => c?.setRowsHidden(false)))} />
            <MenuItem label="Unhide Columns" onSelect={() => (close(), void run("Unhide Columns", () => c?.setColumnsHidden(false)))} />
            <MenuSeparator />
            <MenuHeading>Organize Sheets</MenuHeading>
            <MenuItem label="Rename Sheet…" onSelect={() => (close(), void sheets.rename())} />
            <MenuHeading>Tab Color</MenuHeading>
            <ColorPalette resetLabel="No Color" onPick={(color) => (close(), void sheets.setTabColor(color))} />
          </Menu>
        )}
      />
    </RibbonGroup>
  );
}

const AGGREGATES: [AggregateFunction, string][] = [
  ["SUM", "Sum"],
  ["AVERAGE", "Average"],
  ["COUNT", "Count Numbers"],
  ["MAX", "Max"],
  ["MIN", "Min"],
];

export function AutoSumButton({ size = "small" }: { size?: "small" | "large" }) {
  const c = useSheetController();
  const run = useRunCommand();
  const autoSum = (fn: AggregateFunction) =>
    run("AutoSum", async () => {
      const written = await c?.autoSum(fn);
      if (written === 0) throw new Error("Select a cell below or beside numbers, or a range of numbers.");
    });
  return (
    <RibbonButton
      icon={Sigma}
      label="AutoSum"
      size={size}
      keys="⇧⌘T"
      desc="Total the numbers above or beside the selection."
      onClick={() => autoSum("SUM")}
      testId="cmd-autosum"
      splitMenu={(close) => (
        <Menu label="AutoSum">
          {AGGREGATES.map(([fn, label]) => (
            <MenuItem key={fn} label={label} onSelect={() => (close(), void autoSum(fn))} />
          ))}
        </Menu>
      )}
    />
  );
}

function EditingGroup() {
  const c = useSheetController();
  const run = useRunCommand();
  return (
    <RibbonGroup label="Editing" icon={Sigma}>
      <RibbonStack>
        <AutoSumButton />
        <RibbonButton
          icon={ArrowDownToLine}
          label="Fill"
          desc="Copy the first row or column of the selection across it."
          testId="cmd-fill-series"
          menu={(close) => (
            <Menu label="Fill">
              <MenuItem icon={ArrowDownToLine} label="Down" shortcut="⌘D" onSelect={() => (close(), void run("Fill Down", () => c?.fillDown()))} />
              <MenuItem icon={ArrowRightToLine} label="Right" shortcut="⌘R" onSelect={() => (close(), void run("Fill Right", () => c?.fillRight()))} />
            </Menu>
          )}
        />
        <RibbonButton
          icon={Eraser}
          label="Clear"
          desc="Clear contents, formats or both."
          testId="cmd-clear"
          menu={(close) => (
            <Menu label="Clear">
              <MenuItem label="Clear All" onSelect={() => (close(), void run("Clear All", () => c?.clear("all")))} />
              <MenuItem label="Clear Formats" onSelect={() => (close(), void run("Clear Formats", () => c?.clear("formats")))} />
              <MenuItem label="Clear Contents" shortcut="⌫" onSelect={() => (close(), void run("Clear Contents", () => c?.clear("contents")))} />
            </Menu>
          )}
        />
      </RibbonStack>
      <RibbonButton icon={ArrowDownAZ} label="Sort & Filter" size="large" disabled disabledReason={NO_PLUGIN} />
      <RibbonButton icon={Search} label="Find & Select" size="large" keys="⌘F" disabled disabledReason={NO_PLUGIN} />
    </RibbonGroup>
  );
}
