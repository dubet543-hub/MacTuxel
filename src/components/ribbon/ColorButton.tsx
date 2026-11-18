import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ColorPalette } from "../ui/ColorPalette";
import { RibbonButton } from "./RibbonButton";

interface ColorButtonProps {
  icon: LucideIcon;
  label: string;
  desc: string;
  resetLabel: string;
  initialColor: string;
  current: string | null;
  apply: (color: string | null) => unknown;
  testId?: string;
}

/** Split button: applies the last-used color; the arrow opens the palette. */
export function ColorButton({ icon, label, desc, resetLabel, initialColor, current, apply, testId }: ColorButtonProps) {
  const [last, setLast] = useState(initialColor);
  return (
    <RibbonButton
      icon={icon}
      label={label}
      size="icon"
      desc={desc}
      swatch={last}
      testId={testId}
      onClick={() => apply(last)}
      splitMenu={(close) => (
        <ColorPalette
          resetLabel={resetLabel}
          current={current}
          onPick={(color) => {
            close();
            if (color) setLast(color);
            void apply(color);
          }}
        />
      )}
    />
  );
}
