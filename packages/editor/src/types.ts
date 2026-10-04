import type { SerializedEditorState } from "lexical";
import type { ReactNode } from "react";

/** Canonical editor value persisted by consumers. DOM or HTML is never the source of truth. */
export type EditorJSON = SerializedEditorState;

export type EditorChangeHandler = (value: EditorJSON) => void;

export interface RichTextEditorProps {
  /** Initial canonical Lexical state. To load another document, remount with a new `key`. */
  initialValue?: EditorJSON;
  /** Called with canonical JSON after user edits. */
  onChange?: EditorChangeHandler;
  /** Accessible name for the editable region. */
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  readOnly?: boolean;
  /** Supply a custom toolbar slot; defaults to the accessible baseline toolbar. */
  toolbar?: ReactNode;
  /** Additional content rendered after the editable surface. */
  children?: ReactNode;
}

export interface EditorProviderProps extends Omit<RichTextEditorProps, "toolbar" | "children"> {
  children: ReactNode;
}

export interface EditorContentProps {
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}

export type InlineFormat = "bold" | "italic" | "underline" | "strikethrough";
export type EditorListType = "bullet" | "number";
