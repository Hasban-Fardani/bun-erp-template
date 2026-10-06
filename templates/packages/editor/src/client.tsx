import "./styles.css";

import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { type InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type EditorState,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { isSafeLinkUrl } from "./is-safe-link-url";
import type {
  EditorContentProps,
  EditorJSON,
  EditorListType,
  EditorProviderProps,
  InlineFormat,
  RichTextEditorProps,
} from "./types";

const theme = {
  paragraph: "rte__paragraph",
  heading: {
    h1: "rte__heading rte__heading--h1",
    h2: "rte__heading rte__heading--h2",
    h3: "rte__heading rte__heading--h3",
  },
  quote: "rte__quote",
  list: {
    ul: "rte__list rte__list--unordered",
    ol: "rte__list rte__list--ordered",
    listitem: "rte__list-item",
  },
  text: {
    bold: "rte__text--bold",
    italic: "rte__text--italic",
    underline: "rte__text--underline",
    strikethrough: "rte__text--strikethrough",
  },
};

function joinClassNames(...names: Array<string | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function reportEditorError(error: Error): void {
  throw error;
}

function EditorChangePlugin({ onChange }: { onChange?: (value: EditorJSON) => void }) {
  const handleChange = useCallback((state: EditorState) => onChange?.(state.toJSON()), [onChange]);
  return <OnChangePlugin onChange={handleChange} />;
}

function EditableStatePlugin({ readOnly }: { readOnly: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.setEditable(!readOnly), [editor, readOnly]);
  return null;
}

export function EditorProvider({
  initialValue,
  onChange,
  ariaLabel = "Rich text editor",
  placeholder = "Start writing…",
  className,
  contentClassName,
  readOnly = false,
  children,
}: EditorProviderProps) {
  const [initialConfig] = useState<InitialConfigType>(() => ({
    namespace: "BunErpRichTextEditor",
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
    editorState: initialValue ? JSON.stringify(initialValue) : null,
    editable: !readOnly,
    onError: reportEditorError,
  }));

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={joinClassNames("bun-erp-editor", className)}>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={isSafeLinkUrl} />
        <EditorChangePlugin onChange={onChange} />
        <EditableStatePlugin readOnly={readOnly} />
        {children ?? (
          <>
            <DefaultEditorToolbar />
            <EditorContent ariaLabel={ariaLabel} placeholder={placeholder} className={contentClassName} />
          </>
        )}
      </div>
    </LexicalComposer>
  );
}

export function EditorToolbar({
  children,
  ariaLabel = "Text formatting",
  className,
}: {
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <fieldset className={joinClassNames("rte__toolbar", className)}>
      <legend className="rte__sr-only">{ariaLabel}</legend>
      {children}
    </fieldset>
  );
}

export function EditorContent({
  ariaLabel = "Rich text editor",
  placeholder = "Start writing…",
  className,
}: EditorContentProps) {
  return (
    <div className={joinClassNames("rte__surface", className)}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="rte__editable"
            aria-label={ariaLabel}
            aria-placeholder={placeholder}
            aria-multiline="true"
            placeholder={<div className="rte__placeholder">{placeholder}</div>}
            role="textbox"
            spellCheck
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  pressed,
  disabled,
  onClick,
  className,
}: {
  children: ReactNode;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  const preserveSelection = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();
  return (
    <button
      className={joinClassNames("rte__button", className)}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      title={label}
      onMouseDown={preserveSelection}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function useActiveState(readActive: () => boolean): boolean {
  const [editor] = useLexicalComposerContext();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = (state: EditorState) => setActive(state.read(readActive));
    update(editor.getEditorState());
    return editor.registerUpdateListener(({ editorState }) => update(editorState));
  }, [editor, readActive]);

  return active;
}

export function EditorFormatButton({ format }: { format: InlineFormat }) {
  const [editor] = useLexicalComposerContext();
  const readActive = useCallback(() => {
    const selection = $getSelection();
    return $isRangeSelection(selection) && selection.hasFormat(format);
  }, [format]);
  const pressed = useActiveState(readActive);
  const labels: Record<InlineFormat, string> = {
    bold: "Bold",
    italic: "Italic",
    underline: "Underline",
    strikethrough: "Strikethrough",
  };
  const glyphs: Record<InlineFormat, string> = {
    bold: "B",
    italic: "I",
    underline: "U",
    strikethrough: "S",
  };

  return (
    <ToolbarButton
      label={labels[format]}
      pressed={pressed}
      disabled={!editor.isEditable()}
      onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
      className={`rte__button--${format}`}
    >
      <span aria-hidden="true">{glyphs[format]}</span>
    </ToolbarButton>
  );
}

type BlockFormat = "paragraph" | "h1" | "h2" | "h3" | "quote";

function getBlockFormat(): BlockFormat {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return "paragraph";
  let node = selection.anchor.getNode();
  while (node.getType() !== "root") {
    if ($isHeadingNode(node)) {
      const tag = node.getTag();
      if (tag === "h1" || tag === "h2" || tag === "h3") return tag;
    }
    if ($isQuoteNode(node)) return "quote";
    const parent = node.getParent();
    if (!parent) break;
    node = parent;
  }
  return "paragraph";
}

export function EditorBlockFormatSelect() {
  const [editor] = useLexicalComposerContext();
  const [value, setValue] = useState<BlockFormat>("paragraph");

  useEffect(() => {
    const update = (state: EditorState) => setValue(state.read(getBlockFormat));
    update(editor.getEditorState());
    return editor.registerUpdateListener(({ editorState }) => update(editorState));
  }, [editor]);

  const changeBlock = (format: BlockFormat) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () => {
        if (format === "h1" || format === "h2" || format === "h3") {
          return $createHeadingNode(format);
        }
        if (format === "quote") return $createQuoteNode();
        return $createParagraphNode();
      });
    });
  };

  return (
    <label className="rte__select-wrap">
      <span className="rte__sr-only">Text style</span>
      <select
        className="rte__select"
        aria-label="Text style"
        value={value}
        disabled={!editor.isEditable()}
        onChange={(event) => changeBlock(event.currentTarget.value as BlockFormat)}
      >
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="quote">Quote</option>
      </select>
    </label>
  );
}

function readListActive(listType: EditorListType): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  let node = selection.anchor.getNode();
  while (node.getType() !== "root") {
    if ($isListNode(node)) {
      return node.getListType() === listType;
    }
    const parent = node.getParent();
    if (!parent) break;
    node = parent;
  }
  return false;
}

export function EditorListButton({ listType }: { listType: EditorListType }) {
  const [editor] = useLexicalComposerContext();
  const readActive = useCallback(() => readListActive(listType), [listType]);
  const pressed = useActiveState(readActive);
  const isBullet = listType === "bullet";
  const label = isBullet ? "Bulleted list" : "Numbered list";

  return (
    <ToolbarButton
      label={label}
      pressed={pressed}
      disabled={!editor.isEditable()}
      onClick={() =>
        editor.dispatchCommand(isBullet ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined)
      }
    >
      <span aria-hidden="true">{isBullet ? "• List" : "1. List"}</span>
    </ToolbarButton>
  );
}

export function EditorHistoryButton({ action }: { action: "undo" | "redo" }) {
  const [editor] = useLexicalComposerContext();
  const isUndo = action === "undo";
  const label = isUndo ? "Undo" : "Redo";

  return (
    <ToolbarButton
      label={label}
      disabled={!editor.isEditable()}
      onClick={() => editor.dispatchCommand(isUndo ? UNDO_COMMAND : REDO_COMMAND, undefined)}
    >
      <span aria-hidden="true">{isUndo ? "↶" : "↷"}</span>
    </ToolbarButton>
  );
}

function getLinkUrlFromSelection(): string | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  let node = selection.anchor.getNode();
  while (node.getType() !== "root") {
    if ($isLinkNode(node)) return node.getURL();
    const parent = node.getParent();
    if (!parent) break;
    node = parent;
  }
  return null;
}

export function EditorLinkControl() {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const selectionRef = useRef<ReturnType<typeof $getSelection>>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkErrorId = `rte-link-error-${useId()}`;

  useEffect(() => {
    const update = (state: EditorState) => setActiveUrl(state.read(getLinkUrlFromSelection));
    update(editor.getEditorState());
    return editor.registerUpdateListener(({ editorState }) => update(editorState));
  }, [editor]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const beginEdit = () => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      selectionRef.current = selection?.clone() ?? null;
      setSelectedText($isRangeSelection(selection) ? selection.getTextContent() : "");
      const selectedUrl = getLinkUrlFromSelection();
      setActiveUrl(selectedUrl);
      setUrl(selectedUrl ?? "");
      setError("");
    });
    setOpen((current) => !current);
  };

  const submitLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSafeLinkUrl(url)) {
      setError("Enter a valid web, email, telephone, or relative link.");
      return;
    }
    if (!selectedText && !activeUrl) {
      setError("Select text in the editor before adding a link.");
      return;
    }

    editor.update(() => {
      const selection = selectionRef.current?.clone() ?? null;
      if (selection) {
        // Reapply the saved editor selection after keyboard focus moved to the URL field.
        $setSelection(selection);
      }
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url.trim());
    });
    setOpen(false);
  };

  const removeLink = () => {
    editor.update(() => {
      const selection = selectionRef.current?.clone() ?? null;
      if (selection) $setSelection(selection);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    });
    setOpen(false);
  };

  return (
    <div className="rte__link-control">
      <ToolbarButton label="Link" pressed={Boolean(activeUrl)} disabled={!editor.isEditable()} onClick={beginEdit}>
        <span aria-hidden="true">Link</span>
      </ToolbarButton>
      {open && (
        <form className="rte__link-form" onSubmit={submitLink}>
          <label className="rte__link-label">
            Link URL
            <input
              ref={inputRef}
              className="rte__link-input"
              type="text"
              inputMode="url"
              value={url}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? linkErrorId : undefined}
              onChange={(event) => setUrl(event.currentTarget.value)}
            />
          </label>
          {error && (
            <p className="rte__link-error" id={linkErrorId} role="alert">
              {error}
            </p>
          )}
          <div className="rte__link-actions">
            <button className="rte__button" type="submit">
              Apply
            </button>
            {activeUrl && (
              <button className="rte__button" type="button" onClick={removeLink}>
                Remove link
              </button>
            )}
            <button className="rte__button" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function DefaultEditorToolbar() {
  return (
    <EditorToolbar>
      <EditorBlockFormatSelect />
      <EditorFormatButton format="bold" />
      <EditorFormatButton format="italic" />
      <EditorFormatButton format="underline" />
      <EditorFormatButton format="strikethrough" />
      <EditorListButton listType="bullet" />
      <EditorListButton listType="number" />
      <EditorLinkControl />
      <EditorHistoryButton action="undo" />
      <EditorHistoryButton action="redo" />
    </EditorToolbar>
  );
}

export function RichTextEditor({
  initialValue,
  onChange,
  ariaLabel,
  placeholder,
  className,
  contentClassName,
  readOnly,
  toolbar,
  children,
}: RichTextEditorProps) {
  const providerChildren = useMemo(
    () => (
      <>
        {toolbar ?? <DefaultEditorToolbar />}
        <EditorContent ariaLabel={ariaLabel} placeholder={placeholder} className={contentClassName} />
        {children}
      </>
    ),
    [ariaLabel, children, contentClassName, placeholder, toolbar],
  );

  return (
    <EditorProvider
      initialValue={initialValue}
      onChange={onChange}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      className={className}
      contentClassName={contentClassName}
      readOnly={readOnly}
    >
      {providerChildren}
    </EditorProvider>
  );
}

export { isSafeLinkUrl };
