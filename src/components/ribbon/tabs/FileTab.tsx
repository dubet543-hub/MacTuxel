import { FileDown, FilePlus, FileSpreadsheet, FolderOpen, History, Save, SaveAll, ShieldAlert } from "lucide-react";
import type { DocumentApi } from "../../../app/useDocument";
import { Menu, MenuItem, MenuSeparator } from "../../ui/Menu";
import { RibbonButton } from "../RibbonButton";
import { RibbonGroup } from "../RibbonGroup";

const DESKTOP_ONLY = "Available in the MacTuxel desktop app.";

export function FileTab({ docApi }: { docApi: DocumentApi }) {
  const { canUseFiles, recent, doc } = docApi;
  return (
    <>
      <RibbonGroup label="Workbook" icon={FileSpreadsheet}>
        <RibbonButton icon={FilePlus} label="New" size="large" keys="⌘N" desc="Start a blank workbook." onClick={docApi.newDocument} testId="file-new" />
        <RibbonButton
          icon={FolderOpen}
          label="Open"
          size="large"
          keys="⌘O"
          desc="Open .xlsx, .xls, .ods or .csv files."
          onClick={docApi.openDocument}
          disabled={!canUseFiles}
          disabledReason={DESKTOP_ONLY}
          testId="file-open"
        />
        <RibbonButton
          icon={History}
          label="Open Recent"
          size="large"
          desc="Reopen a workbook you used recently."
          disabled={!canUseFiles}
          disabledReason={DESKTOP_ONLY}
          testId="file-recent"
          menu={(close) => (
            <Menu label="Open Recent">
              {recent.length === 0 && <MenuItem label="No Recent Files" disabled onSelect={() => undefined} />}
              {recent.map((r) => (
                <MenuItem key={r.path} label={r.name} onSelect={() => (close(), void docApi.openRecent(r.path))}>
                  <span className="fn-item">
                    <span>{r.name}</span>
                    <span className="fn-item__desc">{r.path}</span>
                  </span>
                </MenuItem>
              ))}
              {recent.length > 0 && (
                <>
                  <MenuSeparator />
                  <MenuItem label="Clear Menu" onSelect={() => (close(), docApi.clearRecent())} />
                </>
              )}
            </Menu>
          )}
        />
      </RibbonGroup>
      <RibbonGroup label="Save" icon={Save}>
        <RibbonButton
          icon={Save}
          label="Save"
          size="large"
          keys="⌘S"
          desc={doc.path ? `Save to ${doc.name}.` : "Save as an Excel workbook (.xlsx)."}
          onClick={docApi.saveDocument}
          disabled={!canUseFiles}
          disabledReason={DESKTOP_ONLY}
          testId="file-save"
        />
        <RibbonButton
          icon={SaveAll}
          label="Save As"
          size="large"
          keys="⇧⌘S"
          desc="Save a copy under a new name (.xlsx)."
          onClick={docApi.saveDocumentAs}
          disabled={!canUseFiles}
          disabledReason={DESKTOP_ONLY}
          testId="file-save-as"
        />
        <RibbonButton
          icon={FileDown}
          label="Export CSV"
          size="large"
          desc="Export the current sheet's values as CSV (UTF-8)."
          onClick={docApi.exportCsv}
          disabled={!canUseFiles}
          disabledReason={DESKTOP_ONLY}
          testId="file-export-csv"
        />
      </RibbonGroup>
      <RibbonGroup label="Inspect" icon={ShieldAlert}>
        <RibbonButton
          icon={ShieldAlert}
          label="Compatibility Report"
          size="large"
          desc="Features in this file that MacTuxel can't keep."
          onClick={docApi.showCompatibilityReport}
          testId="file-compat"
        />
      </RibbonGroup>
    </>
  );
}
