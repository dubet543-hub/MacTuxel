import { Minus, Plus } from "lucide-react";
import { useSheetController, useSheetState } from "../../spreadsheet/SheetContext";
import { MAX_ZOOM, MIN_ZOOM } from "../../spreadsheet/SheetController";
import { formatStat } from "../../spreadsheet/selectionStats";
import "./statusbar.css";

const ZOOM_STEP = 0.1;

/** Mode, selection statistics (Average, Count, Sum) and zoom controls. */
export function StatusBar({ message }: { message: string }) {
  const controller = useSheetController();
  const { stats, zoom, editing } = useSheetState();
  const showStats = stats.cells > 1 && stats.count > 0;
  const percent = Math.round(zoom * 100);
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <footer className="statusbar" data-testid="status-bar">
      <span className="statusbar__mode" data-testid="status-message" role="status">
        {editing ? "Edit" : message}
      </span>
      <div className="statusbar__stats" data-testid="selection-stats" aria-live="polite">
        {showStats && stats.average !== null && (
          <span>
            Average: <b data-testid="stat-average">{formatStat(stats.average)}</b>
          </span>
        )}
        {showStats && (
          <span>
            Count: <b data-testid="stat-count">{stats.count}</b>
          </span>
        )}
        {showStats && stats.numericCount > 0 && (
          <span>
            Sum: <b data-testid="stat-sum">{formatStat(stats.sum)}</b>
          </span>
        )}
      </div>
      <div className="zoom" aria-label="Zoom">
        <button type="button" aria-label="Zoom Out" data-tip="Zoom Out" data-tip-keys="⌘-" onMouseDown={keep} onClick={() => controller?.setZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}>
          <Minus size={13} strokeWidth={2} />
        </button>
        <input
          type="range"
          className="zoom__slider"
          aria-label="Zoom level"
          data-testid="zoom-slider"
          min={MIN_ZOOM * 100}
          max={MAX_ZOOM * 100}
          step={5}
          value={percent}
          onMouseDown={keep}
          onChange={(e) => controller?.setZoom(Number(e.target.value) / 100)}
        />
        <button type="button" aria-label="Zoom In" data-tip="Zoom In" data-tip-keys="⌘=" onMouseDown={keep} onClick={() => controller?.setZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>
          <Plus size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="zoom__value"
          data-testid="zoom-value"
          aria-label={`Zoom ${percent}%. Reset to 100%`}
          data-tip="Reset Zoom"
          data-tip-keys="⌘0"
          onMouseDown={keep}
          onClick={() => controller?.setZoom(1)}
        >
          {percent}%
        </button>
      </div>
    </footer>
  );
}
