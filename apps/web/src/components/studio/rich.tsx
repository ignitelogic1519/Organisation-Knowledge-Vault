"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Rich-text plumbing for the Studio. One provider tracks which editable area the caret is
// in and what formatting is active there; every toolbar button then routes through it, so
// a single ribbon can drive whichever block the author is currently writing in — the way a
// document editor is expected to behave.

interface ActiveEditor {
  el: HTMLElement;
  commit: (html: string) => void;
}

export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bullets: boolean;
  numbers: boolean;
  link: boolean;
}

const EMPTY_STATE: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  bullets: false,
  numbers: false,
  link: false,
};

interface RichApi {
  /** Run a document command against the focused editor (bold, lists, alignment, …). */
  exec: (command: string, value?: string) => void;
  /** Wrap the selection (or the whole block when nothing is selected) in one CSS rule. */
  applyStyle: (property: string, value: string) => void;
  clearFormatting: () => void;
  /** Drop every inline style/tag we can, leaving the text. */
  state: FormatState;
  focused: boolean;
  register: (editor: ActiveEditor | null) => void;
  /** Remembers the caret so a toolbar click doesn't lose the author's place. */
  rememberSelection: () => void;
}

const RichContext = createContext<RichApi | null>(null);

export function useRichText(): RichApi {
  const ctx = useContext(RichContext);
  if (!ctx) throw new Error("useRichText must be used inside <RichTextProvider>");
  return ctx;
}

export function RichTextProvider({ children }: { children: React.ReactNode }) {
  const active = useRef<ActiveEditor | null>(null);
  const saved = useRef<Range | null>(null);
  const [state, setState] = useState<FormatState>(EMPTY_STATE);
  const [focused, setFocused] = useState(false);

  const readState = useCallback(() => {
    if (typeof document === "undefined" || !active.current) return;
    try {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const inLink =
        node instanceof Node
          ? !!(node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest("a")
          : false;
      setState({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strike: document.queryCommandState("strikeThrough"),
        bullets: document.queryCommandState("insertUnorderedList"),
        numbers: document.queryCommandState("insertOrderedList"),
        link: inLink,
      });
    } catch {
      /* queryCommandState throws in some browsers when nothing is editable */
    }
  }, []);

  const rememberSelection = useCallback(() => {
    const sel = window.getSelection();
    const el = active.current?.el;
    if (!sel || sel.rangeCount === 0 || !el) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) saved.current = range.cloneRange();
  }, []);

  const register = useCallback(
    (editor: ActiveEditor | null) => {
      active.current = editor;
      setFocused(!!editor);
      if (editor) readState();
      else setState(EMPTY_STATE);
    },
    [readState],
  );

  useEffect(() => {
    const onSelectionChange = () => {
      rememberSelection();
      readState();
    };
    // Focus that lands anywhere but a text area (a table cell, a URL field, the page) means
    // the ribbon no longer has text to act on — it then targets the selected block instead
    // of silently formatting whatever the author wrote last.
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.closest(".studio-rich-area") || el.closest(".studio-ribbon")) return;
      register(null);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [readState, rememberSelection, register]);

  /** Put the caret back where it was before the toolbar stole focus. */
  const restore = useCallback((): ActiveEditor | null => {
    const editor = active.current;
    if (!editor) return null;
    editor.el.focus({ preventScroll: true });
    const sel = window.getSelection();
    const range = saved.current;
    if (sel && range && editor.el.contains(range.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return editor;
  }, []);

  const exec = useCallback(
    (command: string, value?: string) => {
      const editor = restore();
      if (!editor) return;
      try {
        document.execCommand("styleWithCSS", false, "true");
        document.execCommand(command, false, value);
      } catch {
        /* command unsupported — nothing to do */
      }
      editor.commit(editor.el.innerHTML);
      rememberSelection();
      readState();
    },
    [restore, readState, rememberSelection],
  );

  const applyStyle = useCallback(
    (property: string, value: string) => {
      const editor = restore();
      if (!editor) return;
      const sel = window.getSelection();
      if (!sel) return;
      // Nothing selected → the author means "this whole block"
      if (sel.isCollapsed || sel.rangeCount === 0) {
        const range = document.createRange();
        range.selectNodeContents(editor.el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.setProperty(property, value);
      try {
        range.surroundContents(span);
      } catch {
        // Selection crosses element boundaries — extract and re-wrap instead
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
      const after = document.createRange();
      after.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(after);
      editor.commit(editor.el.innerHTML);
      rememberSelection();
      readState();
    },
    [restore, readState, rememberSelection],
  );

  const clearFormatting = useCallback(() => {
    const editor = restore();
    if (!editor) return;
    try {
      document.execCommand("removeFormat");
      document.execCommand("unlink");
    } catch {
      /* ignore */
    }
    editor.el.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
    editor.commit(editor.el.innerHTML);
    readState();
  }, [restore, readState]);

  const api = useMemo<RichApi>(
    () => ({ exec, applyStyle, clearFormatting, state, focused, register, rememberSelection }),
    [exec, applyStyle, clearFormatting, state, focused, register, rememberSelection],
  );

  return <RichContext.Provider value={api}>{children}</RichContext.Provider>;
}

/**
 * One editable area. Content is written into the DOM only when the author isn't typing
 * in it, so the caret never jumps while a parent re-renders.
 */
export function RichText({
  html,
  onChange,
  placeholder,
  className = "",
  style,
  singleLine = false,
  onEnterBelow,
}: {
  html: string;
  onChange: (html: string) => void;
  placeholder: string;
  className?: string;
  style?: React.CSSProperties;
  /** Heading-style areas: Enter creates the next block instead of a new line. */
  singleLine?: boolean;
  onEnterBelow?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { register, rememberSelection } = useRichText();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return; // author is typing — never clobber the caret
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [html]);

  return (
    <div
      ref={ref}
      className={`studio-rich-area ${className}`}
      style={style}
      contentEditable
      role="textbox"
      aria-multiline={!singleLine}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onFocus={() => {
        const el = ref.current;
        if (el) register({ el, commit: onChange });
      }}
      onBlur={(e) => {
        onChange(e.currentTarget.innerHTML);
        // Keep the registration: the ribbon needs it to re-focus after a button click
      }}
      onMouseUp={rememberSelection}
      onKeyUp={rememberSelection}
      onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
      onKeyDown={(e) => {
        if (singleLine && e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onEnterBelow?.();
        }
      }}
      onPaste={(e) => {
        // Paste as text + the formatting we allow: strips Word/Docs wrappers, keeps words
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
    />
  );
}
