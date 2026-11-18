import {
  ArrowDownAZ,
  ArrowUpZA,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  BookOpen,
  Calculator,
  ChartColumn,
  CircleQuestionMark,
  Columns3,
  FilePlus,
  FileText,
  Funnel,
  Grid3x3,
  Image,
  Info,
  Keyboard,
  Languages,
  Link,
  Lock,
  Maximize2,
  MessageSquarePlus,
  Pencil,
  Printer,
  RectangleHorizontal,
  Ruler,
  Scaling,
  Shapes,
  Shield,
  Snowflake,
  SpellCheck,
  SquareFunction,
  Table,
  TableProperties,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useFormulaBar } from "../../../app/FormulaBarBridge";
import { useRunCommand } from "../../../app/CommandRunner";
import { useSheetActions } from "../../../app/useSheetActions";
import { isTauri, toggleNativeFullscreen } from "../../../platform/tauri";
import { useSheetController, useSheetState } from "../../../spreadsheet/SheetContext";
import { FUNCTION_CATEGORIES, functionsIn, type FunctionCategory } from "../../../spreadsheet/functionCatalog";
import type { ThemePreference } from "../../../theme/colorScheme";
import { useAppDialogs } from "../../dialogs/useAppDialogs";
import { ThemeSwitcher } from "../../ThemeSwitcher";
import { ColorPalette } from "../../ui/ColorPalette";
import { Menu, MenuItem } from "../../ui/Menu";
import { RibbonButton } from "../RibbonButton";
import { RibbonGroup, RibbonStack } from "../RibbonGroup";
import { AutoSumButton } from "./HomeTab";

const NOT_YET = "This feature isn't included in MacTuxel yet.";
const NO_PRINT = "Printing and page setup arrive in a later MacTuxel release.";

const CATEGORY_ICONS: Record<FunctionCategory, typeof Calculator> = {
  "Math & Trig": Calculator,
  Statistical: ChartColumn,
  Logical: CircleQuestionMark,
  Text: Type,
  "Date & Time": TableProperties,
  "Lookup & Reference": BookOpen,
};

function FunctionMenuButton({ category }: { category: FunctionCategory }) {
  const formulaBar = useFormulaBar();
  return (
    <RibbonButton
      icon={CATEGORY_ICONS[category]}
      label={category}
      size="large"
      desc={`Insert a ${category.toLowerCase()} function.`}
      testId={`fn-${category}`}
      menu={(close) => (
        <Menu label={category}>
          {functionsIn(category).map((f) => (
            <MenuItem
              key={f.name}
              label={f.name}
              onSelect={() => {
                close();
                formulaBar.edit(`=${f.name}(`);
              }}
            >
              <span className="fn-item">
                <span className="fn-item__name">{f.name}</span>
                <span className="fn-item__desc">{f.description}</span>
              </span>
            </MenuItem>
          ))}
        </Menu>
      )}
    />
  );
}

export function InsertTab() {
  const c = useSheetController();
  const sheets = useSheetActions();
  const formulaBar = useFormulaBar();
  return (
    <>
      <RibbonGroup label="Tables">
        <RibbonButton icon={Table} label="Table" size="large" disabled disabledReason={NOT_YET} />
        <RibbonButton icon={TableProperties} label="PivotTable" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
      <RibbonGroup label="Cells">
        <RibbonButton icon={BetweenHorizontalStart} label="Rows" size="large" desc="Insert rows above the selection." onClick={() => c?.insertRows()} testId="ins-rows" />
        <RibbonButton icon={BetweenVerticalStart} label="Columns" size="large" desc="Insert columns left of the selection." onClick={() => c?.insertColumns()} testId="ins-cols" />
        <RibbonButton icon={FilePlus} label="Sheet" size="large" desc="Insert a new worksheet after the current one." onClick={() => sheets.add()} testId="ins-sheet" />
      </RibbonGroup>
      <RibbonGroup label="Illustrations">
        <RibbonButton icon={Image} label="Pictures" size="large" disabled disabledReason={NOT_YET} />
        <RibbonButton icon={Shapes} label="Shapes" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
      <RibbonGroup label="Charts">
        <RibbonButton icon={ChartColumn} label="Chart" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
      <RibbonGroup label="Links & Comments">
        <RibbonButton icon={Link} label="Link" size="large" keys="⌘K" disabled disabledReason={NOT_YET} />
        <RibbonButton icon={MessageSquarePlus} label="Comment" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
      <RibbonGroup label="Functions">
        <RibbonButton icon={SquareFunction} label="Function" size="large" desc="Start a formula in the formula bar." onClick={() => formulaBar.edit("=")} testId="ins-function" />
      </RibbonGroup>
    </>
  );
}

export function PageLayoutTab() {
  const c = useSheetController();
  const run = useRunCommand();
  const sheets = useSheetActions();
  const { gridlines } = useSheetState();
  return (
    <>
      <RibbonGroup label="Page Setup">
        <RibbonButton icon={Ruler} label="Margins" size="large" disabled disabledReason={NO_PRINT} />
        <RibbonButton icon={RectangleHorizontal} label="Orientation" size="large" disabled disabledReason={NO_PRINT} />
        <RibbonButton icon={FileText} label="Size" size="large" disabled disabledReason={NO_PRINT} />
        <RibbonButton icon={Printer} label="Print Area" size="large" disabled disabledReason={NO_PRINT} />
      </RibbonGroup>
      <RibbonGroup label="Sheet Options">
        <RibbonStack>
          <RibbonButton icon={Grid3x3} label="View Gridlines" active={gridlines} onClick={() => c?.setGridlines(!gridlines)} testId="pl-gridlines" />
          <RibbonButton icon={Columns3} label="View Headings" disabled disabledReason={NOT_YET} />
        </RibbonStack>
      </RibbonGroup>
      <RibbonGroup label="Sheet">
        <RibbonButton icon={Pencil} label="Rename" size="large" desc="Rename the current sheet." onClick={() => sheets.rename()} testId="pl-rename" />
        <RibbonButton
          icon={Grid3x3}
          label="Tab Color"
          size="large"
          desc="Color the current sheet's tab."
          testId="pl-tab-color"
          menu={(close) => <ColorPalette resetLabel="No Color" onPick={(color) => (close(), void run("Tab Color", () => sheets.setTabColor(color)))} />}
        />
      </RibbonGroup>
    </>
  );
}

export function FormulasTab() {
  const c = useSheetController();
  const formulaBar = useFormulaBar();
  return (
    <>
      <RibbonGroup label="Function Library">
        <RibbonButton icon={SquareFunction} label="Insert Function" size="large" desc="Start a formula in the formula bar." onClick={() => formulaBar.edit("=")} testId="fx-insert" />
        <AutoSumButton size="large" />
        {FUNCTION_CATEGORIES.map((cat) => (
          <FunctionMenuButton key={cat} category={cat} />
        ))}
      </RibbonGroup>
      <RibbonGroup label="Defined Names">
        <RibbonButton icon={TableProperties} label="Name Manager" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
      <RibbonGroup label="Calculation">
        <RibbonButton icon={Calculator} label="Calculate Now" size="large" keys="F9" desc="Recalculate all formulas in the workbook." onClick={() => c?.recalculate()} testId="fx-calc" />
      </RibbonGroup>
    </>
  );
}

export function DataTab({ onOpenFile, canOpenFiles }: { onOpenFile: () => void; canOpenFiles: boolean }) {
  const c = useSheetController();
  return (
    <>
      <RibbonGroup label="Get Data">
        <RibbonButton
          icon={FileText}
          label="From Text/CSV"
          size="large"
          desc="Open a CSV, TSV or spreadsheet file."
          onClick={onOpenFile}
          disabled={!canOpenFiles}
          disabledReason="Opening files requires the MacTuxel desktop app."
        />
      </RibbonGroup>
      <RibbonGroup label="Sort & Filter">
        <RibbonButton icon={ArrowDownAZ} label="Sort A to Z" size="large" disabled disabledReason={NOT_YET} />
        <RibbonButton icon={ArrowUpZA} label="Sort Z to A" size="large" disabled disabledReason={NOT_YET} />
        <RibbonButton icon={Funnel} label="Filter" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
      <RibbonGroup label="Data Tools">
        <RibbonButton
          icon={Columns3}
          label="Text to Columns"
          size="large"
          desc="Split text in the selected column into several columns (delimiter detected automatically)."
          onClick={() => c?.textToColumns()}
          testId="data-text-to-columns"
        />
        <RibbonButton icon={TableProperties} label="Remove Duplicates" size="large" disabled disabledReason={NOT_YET} />
        <RibbonButton icon={Shield} label="Data Validation" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
    </>
  );
}

export function ReviewTab() {
  const dialogs = useAppDialogs();
  return (
    <>
      <RibbonGroup label="Proofing">
        <RibbonButton icon={SpellCheck} label="Spelling" size="large" disabled disabledReason={NOT_YET} />
        <RibbonButton icon={ChartColumn} label="Workbook Statistics" size="large" desc="Counts of sheets, cells, numbers and formulas." onClick={dialogs.statistics} testId="rv-stats" />
      </RibbonGroup>
      <RibbonGroup label="Language">
        <RibbonButton icon={Languages} label="Translate" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
      <RibbonGroup label="Comments">
        <RibbonButton icon={MessageSquarePlus} label="New Comment" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
      <RibbonGroup label="Protect">
        <RibbonButton icon={Lock} label="Protect Sheet" size="large" disabled disabledReason={NOT_YET} />
        <RibbonButton icon={Shield} label="Protect Workbook" size="large" disabled disabledReason={NOT_YET} />
      </RibbonGroup>
    </>
  );
}

interface ViewTabProps {
  themePreference: ThemePreference;
  onThemeChange: (value: ThemePreference) => void;
}

export function ViewTab({ themePreference, onThemeChange }: ViewTabProps) {
  const c = useSheetController();
  const run = useRunCommand();
  const { gridlines, zoom, frozen } = useSheetState();
  const isFrozen = frozen.rows > 0 || frozen.cols > 0;
  return (
    <>
      <RibbonGroup label="Appearance">
        <div className="rg__centered">
          <ThemeSwitcher value={themePreference} onChange={onThemeChange} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Show">
        <RibbonStack>
          <RibbonButton icon={Grid3x3} label="Gridlines" active={gridlines} onClick={() => c?.setGridlines(!gridlines)} testId="view-gridlines" />
          <RibbonButton icon={Columns3} label="Headings" disabled disabledReason={NOT_YET} />
        </RibbonStack>
      </RibbonGroup>
      <RibbonGroup label="Zoom">
        <RibbonButton icon={ZoomIn} label="Zoom In" size="large" keys="⌘=" onClick={() => c?.setZoom(zoom + 0.1)} testId="view-zoom-in" />
        <RibbonButton icon={ZoomOut} label="Zoom Out" size="large" keys="⌘-" onClick={() => c?.setZoom(zoom - 0.1)} testId="view-zoom-out" />
        <RibbonButton icon={Scaling} label="100%" size="large" keys="⌘0" onClick={() => c?.setZoom(1)} testId="view-zoom-reset" />
      </RibbonGroup>
      <RibbonGroup label="Window">
        <RibbonButton
          icon={Snowflake}
          label="Freeze Panes"
          size="large"
          active={isFrozen}
          desc="Keep rows and columns visible while you scroll."
          testId="view-freeze"
          menu={(close) => (
            <Menu label="Freeze Panes">
              <MenuItem label="Freeze Panes" onSelect={() => (close(), void run("Freeze Panes", () => c?.freezePanes()))}>
                Freeze Panes (above and left of the active cell)
              </MenuItem>
              <MenuItem label="Freeze Top Row" onSelect={() => (close(), void run("Freeze Top Row", () => c?.freezeTopRow()))} />
              <MenuItem label="Freeze First Column" onSelect={() => (close(), void run("Freeze First Column", () => c?.freezeFirstColumn()))} />
              <MenuItem label="Unfreeze Panes" disabled={!isFrozen} disabledReason="Nothing is frozen." onSelect={() => (close(), void run("Unfreeze", () => c?.unfreeze()))} />
            </Menu>
          )}
        />
        <RibbonButton
          icon={Maximize2}
          label="Full Screen"
          size="large"
          keys="⌃⌘F"
          onClick={toggleNativeFullscreen}
          disabled={!isTauri()}
          disabledReason="Full screen is available in the MacTuxel desktop app."
        />
      </RibbonGroup>
    </>
  );
}

export function HelpTab() {
  const dialogs = useAppDialogs();
  return (
    <RibbonGroup label="Help">
      <RibbonButton icon={Keyboard} label="Keyboard Shortcuts" size="large" onClick={dialogs.shortcuts} testId="help-shortcuts" />
      <RibbonButton icon={BookOpen} label="Function Reference" size="large" onClick={dialogs.functions} testId="help-functions" />
      <RibbonButton icon={Info} label="About MacTuxel" size="large" onClick={dialogs.about} testId="help-about" />
    </RibbonGroup>
  );
}
