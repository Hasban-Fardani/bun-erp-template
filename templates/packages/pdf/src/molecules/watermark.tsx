import { Watermark as FormeWatermark } from "@formepdf/react";
import { mergeFormeStyles } from "../lib/pdf-primitives";
import { resolveColor } from "../lib/resolve-color";
import { usePdfcnTheme } from "../providers/theme-provider";
import type { PDFComponentProps } from "../types/pdf-components";

export type WatermarkPosition = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Diagonal watermark overlaid across the full page using absolute positioning.
 * Props - `text` | `opacity` | `fontSize` | `color` | `angle` | `position` | `fixed` | `style`
 * @see {@link PdfWatermarkProps}
 */
export interface PdfWatermarkProps extends Omit<PDFComponentProps, "children"> {
  text: string;
  opacity?: number;
  fontSize?: number;
  color?: string;
  angle?: number;
  position?: WatermarkPosition;
  /**
   * @default true
   */
  fixed?: boolean;
  children?: never;
}

const withOpacity = (color: string, opacity: number): string => {
  const match = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!match) {
    return color;
  }

  const [, red = "00", green = "00", blue = "00"] = match;
  return `rgba(${Number.parseInt(red, 16)}, ${Number.parseInt(green, 16)}, ${Number.parseInt(blue, 16)}, ${opacity})`;
};

export const PdfWatermark = ({
  text,
  opacity = 0.15,
  fontSize = 60,
  color = "mutedForeground",
  angle = -45,
  style,
}: PdfWatermarkProps) => {
  const theme = usePdfcnTheme();
  const resolvedColor = resolveColor(color, theme.colors);

  return (
    <FormeWatermark
      text={text}
      angle={angle}
      color={withOpacity(resolvedColor, opacity)}
      fontSize={fontSize}
      style={mergeFormeStyles(style)}
    />
  );
};
