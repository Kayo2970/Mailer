'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react';
import { editorHtmlToEmailHtml, emailHtmlToEditorHtml, isRichHtmlEmpty, sanitizeEditorHtml } from '@/lib/compose-editor';

export interface RichEditorHandle {
  insertText: (text: string) => void;
  insertImage: (id: string) => void;
  focus: () => void;
}

interface RichEmailEditorProps {
  value: string;
  onChange: (emailHtml: string) => void;
  onFocus?: () => void;
  onInsertImage?: () => void;
  placeholder?: string;
}

const COLOR_SWATCHES = [
  { label: 'Default', value: '#0f172a' },
  { label: 'Slate', value: '#475569' },
  { label: 'Gold', value: '#ca8a04' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Bronze', value: '#b45309' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Violet', value: '#7c3aed' },
];

type ActiveFormats = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  ul: boolean;
  ol: boolean;
  left: boolean;
  center: boolean;
  right: boolean;
};

const EMPTY_ACTIVE: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  ul: false,
  ol: false,
  left: false,
  center: false,
  right: false,
};

function ToolbarButton({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-xs transition ${
        active
          ? 'bg-gradient-to-r from-amber-200 to-yellow-200 text-amber-950 dark:from-amber-900/70 dark:to-yellow-900/60 dark:text-amber-200'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Gmail / Outlook-style WYSIWYG email editor. Renders `/api/images/<id>` inline
 * while editing and serializes clean `<img src="cid:img_<id>@mailer">` tags out.
 */
export const RichEmailEditor = forwardRef<RichEditorHandle, RichEmailEditorProps>(function RichEmailEditor(
  { value, onChange, onFocus, onInsertImage, placeholder = 'Write your message…' },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string>('');
  const savedRangeRef = useRef<Range | null>(null);
  const [active, setActive] = useState<ActiveFormats>(EMPTY_ACTIVE);
  const [blockTag, setBlockTag] = useState('P');
  const [showColors, setShowColors] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkText, setLinkText] = useState('');

  const saveSelection = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (savedRangeRef.current && el.contains(savedRangeRef.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const raw = el.innerHTML;
    const serialized = isRichHtmlEmpty(raw) ? '' : editorHtmlToEmailHtml(raw);
    lastHtmlRef.current = serialized;
    onChange(serialized);
  }, [onChange]);

  const refreshActive = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    saveSelection();
    try {
      const block = String(document.queryCommandValue('formatBlock') || 'p').toUpperCase().replace(/[<>]/g, '');
      setBlockTag(['H2', 'H3', 'BLOCKQUOTE'].includes(block) ? block : 'P');
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
        ul: document.queryCommandState('insertUnorderedList'),
        ol: document.queryCommandState('insertOrderedList'),
        left: document.queryCommandState('justifyLeft'),
        center: document.queryCommandState('justifyCenter'),
        right: document.queryCommandState('justifyRight'),
      });
    } catch {
      // queryCommandState can throw on detached ranges in some browsers
    }
  }, [saveSelection]);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActive);
    return () => document.removeEventListener('selectionchange', refreshActive);
  }, [refreshActive]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastHtmlRef.current) return;
    lastHtmlRef.current = value;
    el.innerHTML = value ? emailHtmlToEditorHtml(value) : '';
  }, [value]);

  const exec = useCallback(
    (command: string, commandValue?: string) => {
      restoreSelection();
      try {
        document.execCommand('defaultParagraphSeparator', false, 'p');
        document.execCommand(command, false, commandValue);
      } catch {
        // Fallback no-op if command unsupported
      }
      emitChange();
      refreshActive();
    },
    [emitChange, refreshActive, restoreSelection]
  );

  const insertHtmlAtCursor = useCallback(
    (html: string) => {
      restoreSelection();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const template = document.createElement('template');
        template.innerHTML = html;
        const frag = template.content;
        const lastNode = frag.lastChild;
        range.insertNode(frag);
        if (lastNode) {
          const next = document.createRange();
          next.setStartAfter(lastNode);
          next.collapse(true);
          sel.removeAllRanges();
          sel.addRange(next);
          savedRangeRef.current = next.cloneRange();
        }
      } else if (editorRef.current) {
        editorRef.current.insertAdjacentHTML('beforeend', html);
      }
      emitChange();
    },
    [emitChange, restoreSelection]
  );

  useImperativeHandle(
    ref,
    () => ({
      insertText: (text: string) => {
        restoreSelection();
        const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        insertHtmlAtCursor(safe);
      },
      insertImage: (id: string) => {
        insertHtmlAtCursor(
          `<img src="/api/images/${id}" data-mailer-image="${id}" alt="" style="display: block; max-width: 100%; height: auto; border: 0; margin: 8px 0;"><p><br></p>`
        );
      },
      focus: () => editorRef.current?.focus(),
    }),
    [insertHtmlAtCursor, restoreSelection]
  );

  const openLinkPopover = () => {
    saveSelection();
    const sel = window.getSelection();
    setLinkText(sel?.toString() || '');
    setLinkUrl('https://');
    setShowColors(false);
    setLinkOpen((v) => !v);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url || url === 'https://') {
      setLinkOpen(false);
      return;
    }
    const safeUrl = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    const label = (linkText.trim() || safeUrl)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const escapedHref = safeUrl.replace(/"/g, '&quot;');
    setLinkOpen(false);
    insertHtmlAtCursor(`<a href="${escapedHref}" style="color: #b45309; text-decoration: underline;">${label}</a>`);
  };

  const wrapInlineCode = () => {
    restoreSelection();
    const sel = window.getSelection();
    const text = sel?.toString() || 'code';
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    insertHtmlAtCursor(
      `<code style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: #f1f5f9; padding: 1px 5px; border-radius: 4px;">${escaped}</code>`
    );
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html) return;
    e.preventDefault();
    insertHtmlAtCursor(sanitizeEditorHtml(html));
  };

  const empty = !value;

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-white/15 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-2 py-1.5 dark:border-white/10">
        <ToolbarButton title="Undo (Ctrl+Z)" onClick={() => exec('undo')}>
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Redo (Ctrl+Y)" onClick={() => exec('redo')}>
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-white/10" />

        <select
          aria-label="Text style"
          value={blockTag}
          onMouseDown={() => saveSelection()}
          onChange={(e) => exec('formatBlock', e.target.value)}
          className="h-7 cursor-pointer rounded-md border border-slate-200 bg-transparent px-1.5 text-xs text-slate-700 outline-none hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <option value="P" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">Normal</option>
          <option value="H2" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">Heading</option>
          <option value="H3" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">Subheading</option>
          <option value="BLOCKQUOTE" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">Quote</option>
        </select>

        <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-white/10" />

        <ToolbarButton title="Bold (Ctrl+B)" active={active.bold} onClick={() => exec('bold')}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Italic (Ctrl+I)" active={active.italic} onClick={() => exec('italic')}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Underline (Ctrl+U)" active={active.underline} onClick={() => exec('underline')}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={active.strike} onClick={() => exec('strikeThrough')}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Inline code" onClick={wrapInlineCode}>
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="relative">
          <ToolbarButton title="Text color" active={showColors} onClick={() => { saveSelection(); setLinkOpen(false); setShowColors((v) => !v); }}>
            <Palette className="h-3.5 w-3.5" />
          </ToolbarButton>
          {showColors && (
            <div className="absolute left-0 top-8 z-20 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-slate-900">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  aria-label={`Text color ${c.label}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    exec('foreColor', c.value);
                    setShowColors(false);
                  }}
                  className="h-5 w-5 cursor-pointer rounded-full border border-slate-300 transition hover:scale-110 dark:border-white/20"
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          )}
        </div>

        <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-white/10" />

        <ToolbarButton title="Bulleted list" active={active.ul} onClick={() => exec('insertUnorderedList')}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" active={active.ol} onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Block quote" active={blockTag === 'BLOCKQUOTE'} onClick={() => exec('formatBlock', blockTag === 'BLOCKQUOTE' ? 'P' : 'BLOCKQUOTE')}>
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-white/10" />

        <ToolbarButton title="Align left" active={active.left} onClick={() => exec('justifyLeft')}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Align center" active={active.center} onClick={() => exec('justifyCenter')}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Align right" active={active.right} onClick={() => exec('justifyRight')}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-white/10" />

        <ToolbarButton title="Insert link" active={linkOpen} onClick={openLinkPopover}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Remove link" onClick={() => exec('unlink')}>
          <Unlink className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Insert divider" onClick={() => insertHtmlAtCursor('<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;"><p><br></p>')}>
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        {onInsertImage && (
          <ToolbarButton title="Insert inline image" onClick={() => { saveSelection(); onInsertImage(); }}>
            <ImagePlus className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton title="Clear formatting" onClick={() => exec('removeFormat')}>
          <RemoveFormatting className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900">
          <input
            type="text"
            className="input !w-36 !py-1 text-xs"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="Link text (optional)"
          />
          <input
            type="url"
            className="input min-w-[12rem] flex-1 !py-1 text-xs"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
              if (e.key === 'Escape') setLinkOpen(false);
            }}
            placeholder="https://example.com"
            autoFocus
          />
          <button type="button" className="btn-primary !px-2.5 !py-1 text-xs" onClick={applyLink}>Apply</button>
          <button type="button" className="btn !px-2 !py-1 text-xs" onClick={() => setLinkOpen(false)}>Cancel</button>
        </div>
      )}

      <div className="relative">
        {empty && (
          <div className="pointer-events-none absolute left-3.5 top-3 text-sm text-slate-400">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          onInput={emitChange}
          onBlur={() => { saveSelection(); emitChange(); }}
          onFocus={() => { onFocus?.(); refreshActive(); }}
          onPaste={onPaste}
          className="min-h-[260px] max-h-[460px] overflow-y-auto px-3.5 py-3 text-sm leading-relaxed text-slate-900 outline-none dark:text-slate-100 [&_a]:text-amber-700 [&_a]:underline dark:[&_a]:text-amber-400 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 dark:[&_blockquote]:border-slate-600 dark:[&_blockquote]:text-slate-300 [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </div>
  );
});

