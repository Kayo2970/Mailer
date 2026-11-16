'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clipboard,
  FileSpreadsheet,
  FileUp,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { csvToGrid, gridToCsv, isValidEmail } from '@/lib/mail-merge';

interface ExcelGridEditorProps {
  value: string;
  onChange: (csv: string) => void;
  onToast?: (toast: { type: 'success' | 'error'; text: string }) => void;
}

const SAMPLE_CSV = 'name, email, company\nAnanya Sharma, ananya@example.com, Acme\nRahul Verma, rahul@example.com, Globex';

function getColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export function ExcelGridEditor({ value, onChange, onToast }: ExcelGridEditorProps) {
  const [columns, setColumns] = useState<string[]>(['email', 'name', 'company']);
  const [rows, setRows] = useState<string[][]>([
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
  ]);
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);
  const [renamingCol, setRenamingCol] = useState<{ index: number; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cellInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const lastSerializedCsvRef = useRef<string>('');

  // Synchronize internal grid state when external `value` prop changes
  useEffect(() => {
    if (value === lastSerializedCsvRef.current) return;
    lastSerializedCsvRef.current = value;
    const parsed = csvToGrid(value);
    setColumns(parsed.columns);
    setRows(parsed.rows.length > 0 ? parsed.rows : [new Array(parsed.columns.length).fill('')]);
  }, [value]);

  const emitGridChange = useCallback(
    (newCols: string[], newRows: string[][]) => {
      const csv = gridToCsv(newCols, newRows);
      lastSerializedCsvRef.current = csv;
      onChange(csv);
    },
    [onChange]
  );

  const focusCell = (r: number, c: number) => {
    setActiveCell({ r, c });
    const key = `${r}-${c}`;
    const el = cellInputRefs.current.get(key);
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleCellChange = (r: number, c: number, newVal: string) => {
    const updated = rows.map((row, rIdx) => (rIdx === r ? row.map((cell, cIdx) => (cIdx === c ? newVal : cell)) : row));
    setRows(updated);
    emitGridChange(columns, updated);
  };

  const addRow = () => {
    const emptyRow = new Array(columns.length).fill('');
    const updated = [...rows, emptyRow];
    setRows(updated);
    emitGridChange(columns, updated);
    setTimeout(() => focusCell(updated.length - 1, 0), 50);
  };

  const removeRow = (rIndex: number) => {
    if (rows.length <= 1) {
      // Keep at least one empty row
      const blank = [new Array(columns.length).fill('')];
      setRows(blank);
      emitGridChange(columns, blank);
      return;
    }
    const updated = rows.filter((_, idx) => idx !== rIndex);
    setRows(updated);
    emitGridChange(columns, updated);
  };

  const addColumn = () => {
    const name = 'custom';
    let counter = 1;
    while (columns.includes(counter === 1 ? name : `${name}_${counter}`)) {
      counter++;
    }
    const colName = counter === 1 ? name : `${name}_${counter}`;
    const newCols = [...columns, colName];
    const newRows = rows.map((r) => [...r, '']);
    setColumns(newCols);
    setRows(newRows);
    emitGridChange(newCols, newRows);
    setRenamingCol({ index: newCols.length - 1, name: colName });
  };

  const removeColumn = (cIndex: number) => {
    if (columns[cIndex] === 'email') {
      onToast?.({ type: 'error', text: 'The email column is required for recipient delivery and cannot be removed.' });
      return;
    }
    if (columns.length <= 1) return;
    const newCols = columns.filter((_, idx) => idx !== cIndex);
    const newRows = rows.map((r) => r.filter((_, idx) => idx !== cIndex));
    setColumns(newCols);
    setRows(newRows);
    emitGridChange(newCols, newRows);
  };

  const saveColumnName = (index: number, newName: string) => {
    const normalized = newName.trim().toLowerCase().replace(/\s+/g, '_') || `column_${index + 1}`;
    const newCols = [...columns];
    newCols[index] = normalized;
    setColumns(newCols);
    setRenamingCol(null);
    emitGridChange(newCols, rows);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'Tab') {
      if (!e.shiftKey) {
        if (c < columns.length - 1) {
          e.preventDefault();
          focusCell(r, c + 1);
        } else if (r < rows.length - 1) {
          e.preventDefault();
          focusCell(r + 1, 0);
        } else {
          // Last cell: create new row
          e.preventDefault();
          addRow();
        }
      } else {
        if (c > 0) {
          e.preventDefault();
          focusCell(r, c - 1);
        } else if (r > 0) {
          e.preventDefault();
          focusCell(r - 1, columns.length - 1);
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (r < rows.length - 1) {
        focusCell(r + 1, c);
      } else {
        addRow();
      }
    } else if (e.key === 'ArrowUp' && r > 0) {
      e.preventDefault();
      focusCell(r - 1, c);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (r < rows.length - 1) {
        focusCell(r + 1, c);
      } else {
        addRow();
      }
    }
  };

  /** Handles pasting 2D tabular data copied directly from Excel, Google Sheets, or CSV files. */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, startR: number, startC: number) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n') && !text.includes(','))) {
      // Normal single-value paste
      return;
    }

    e.preventDefault();
    const delimiter = text.includes('\t') ? '\t' : ',';
    const lines = text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    // Check if user is pasting a whole spreadsheet with a header at (0,0)
    const firstRowTokens = lines[0].split(delimiter).map((s) => s.trim().replace(/^"|"$/g, ''));
    const isHeaderRow =
      startR === 0 &&
      startC === 0 &&
      !firstRowTokens.some(isValidEmail) &&
      firstRowTokens.some((t) => /^(e-?mail|email[ _]?address|mail)$/i.test(t));

    if (isHeaderRow) {
      const parsed = csvToGrid(text);
      setColumns(parsed.columns);
      setRows(parsed.rows);
      emitGridChange(parsed.columns, parsed.rows);
      onToast?.({
        type: 'success',
        text: `Imported ${parsed.rows.length} rows with ${parsed.columns.length} columns from spreadsheet.`,
      });
      return;
    }

    // Grid block paste starting at (startR, startC)
    const pastedMatrix = lines.map((line) => line.split(delimiter).map((val) => val.trim().replace(/^"|"$/g, '')));

    const targetRowCount = Math.max(rows.length, startR + pastedMatrix.length);
    const targetColCount = Math.max(
      columns.length,
      startC + Math.max(...pastedMatrix.map((r) => r.length))
    );

    // Expand columns if needed
    const newCols = [...columns];
    while (newCols.length < targetColCount) {
      newCols.push(`col_${newCols.length + 1}`);
    }

    // Expand rows if needed
    const newRows = rows.map((r) => {
      const copy = [...r];
      while (copy.length < targetColCount) copy.push('');
      return copy;
    });
    while (newRows.length < targetRowCount) {
      newRows.push(new Array(targetColCount).fill(''));
    }

    // Splice in the pasted matrix
    for (let rIdx = 0; rIdx < pastedMatrix.length; rIdx++) {
      for (let cIdx = 0; cIdx < pastedMatrix[rIdx].length; cIdx++) {
        newRows[startR + rIdx][startC + cIdx] = pastedMatrix[rIdx][cIdx];
      }
    }

    setColumns(newCols);
    setRows(newRows);
    emitGridChange(newCols, newRows);
    onToast?.({
      type: 'success',
      text: `Pasted ${pastedMatrix.length} rows from clipboard into grid.`,
    });
  };

  const copyAsCsv = () => {
    const csv = gridToCsv(columns, rows);
    navigator.clipboard.writeText(csv);
    onToast?.({ type: 'success', text: 'Grid data copied to clipboard as CSV.' });
  };

  const clearGrid = () => {
    const blank = [new Array(columns.length).fill('')];
    setRows(blank);
    emitGridChange(columns, blank);
  };

  const loadSample = () => {
    const parsed = csvToGrid(SAMPLE_CSV);
    setColumns(parsed.columns);
    setRows(parsed.rows);
    emitGridChange(parsed.columns, parsed.rows);
    onToast?.({ type: 'success', text: 'Loaded sample recipient spreadsheet.' });
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = csvToGrid(content);
      setColumns(parsed.columns);
      setRows(parsed.rows);
      emitGridChange(parsed.columns, parsed.rows);
      onToast?.({ type: 'success', text: `Loaded ${file.name} (${parsed.rows.length} rows).` });
    } catch {
      onToast?.({ type: 'error', text: `Failed to read file ${file.name}.` });
    }
  };

  const emailColIdx = columns.indexOf('email');
  const validRecipientsCount = rows.filter((r) => emailColIdx !== -1 && isValidEmail(r[emailColIdx])).length;
  const filledRowsCount = rows.filter((r) => r.some((c) => c.trim() !== '')).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
      {/* ── Excel Header / Action Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-xs shadow-xs">
            <FileSpreadsheet className="h-3.5 w-3.5" />
          </div>
          <span className="font-bold text-slate-800 dark:text-slate-100">Spreadsheet Data Editor</span>
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {filledRowsCount} row{filledRowsCount === 1 ? '' : 's'} · {columns.length} cols
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onFileUpload} />
          <button
            type="button"
            onClick={addRow}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-3 w-3 text-emerald-600" />
            Add Row
          </button>
          <button
            type="button"
            onClick={addColumn}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-3 w-3 text-amber-600" />
            Add Column
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileUp className="h-3 w-3 text-blue-600" />
            Upload File
          </button>
          <button
            type="button"
            title="Copy as CSV"
            aria-label="Copy grid data as CSV"
            onClick={copyAsCsv}
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Clipboard className="h-3 w-3" />
          </button>
          {filledRowsCount === 0 && (
            <button
              type="button"
              onClick={loadSample}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200"
            >
              <Sparkles className="h-3 w-3 text-amber-600" />
              Load Sample
            </button>
          )}
          {filledRowsCount > 0 && (
            <button
              type="button"
              title="Clear grid"
              aria-label="Clear grid"
              onClick={clearGrid}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Interactive Spreadsheet Table ── */}
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full border-collapse text-left text-xs" role="grid" aria-label="Recipients spreadsheet grid">
          <thead>
            {/* Row of Column Letters: A, B, C... */}
            <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-500 select-none dark:border-white/10 dark:bg-slate-800/50">
              <th scope="col" className="w-10 border-r border-slate-200 px-2 py-1 text-center font-mono text-[10px] text-slate-400 dark:border-white/10">
                #
              </th>
              {columns.map((_, colIdx) => (
                <th
                  key={colIdx}
                  scope="col"
                  className="border-r border-slate-200 px-3 py-1 text-center font-mono text-[11px] font-bold text-slate-500 dark:border-white/10 dark:text-slate-400"
                >
                  {getColumnLetter(colIdx)}
                </th>
              ))}
              <th scope="col" className="w-12 px-2 py-1 text-center text-[10px] text-slate-400">
                Act
              </th>
            </tr>

            {/* Row of Column Names & Merge Placeholders */}
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-800/80">
              <th scope="col" className="border-r border-slate-200 px-2 py-1.5 text-center text-[10px] text-slate-400 dark:border-white/10">
                Col
              </th>
              {columns.map((col, colIdx) => {
                const isEmail = col === 'email';
                const isRenaming = renamingCol?.index === colIdx;

                return (
                  <th
                    key={colIdx}
                    scope="col"
                    className="group border-r border-slate-200 px-2.5 py-1.5 font-medium dark:border-white/10"
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={renamingCol.name}
                          onChange={(e) => setRenamingCol({ index: colIdx, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveColumnName(colIdx, renamingCol.name);
                            if (e.key === 'Escape') setRenamingCol(null);
                          }}
                          onBlur={() => saveColumnName(colIdx, renamingCol.name)}
                          autoFocus
                          className="input !py-0.5 !px-1.5 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            saveColumnName(colIdx, renamingCol.name);
                          }}
                          className="cursor-pointer text-emerald-600"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-1.5">
                        <div
                          className="flex cursor-pointer items-center gap-1.5"
                          onClick={() => setRenamingCol({ index: colIdx, name: col })}
                          title="Click to rename column"
                        >
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
                              isEmail
                                ? 'bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-200'
                                : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {col}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {`{{${col}}}`}
                          </span>
                        </div>
                        {!isEmail && (
                          <button
                            type="button"
                            title={`Delete column ${col}`}
                            aria-label={`Delete column ${col}`}
                            onClick={() => removeColumn(colIdx)}
                            className="cursor-pointer text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 transition"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
              <th scope="col" className="px-2 py-1.5 text-center">
                <button
                  type="button"
                  title="Add new column"
                  aria-label="Add new column"
                  onClick={addColumn}
                  className="cursor-pointer text-slate-400 hover:text-amber-600"
                >
                  <Plus className="mx-auto h-3.5 w-3.5" />
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-white/10">
            {rows.map((row, rIdx) => {
              const rowEmail = emailColIdx !== -1 ? (row[emailColIdx] || '').trim() : '';
              const hasEmailError = rowEmail !== '' && !isValidEmail(rowEmail);

              return (
                <tr key={rIdx} className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  {/* Sticky Row Number Column */}
                  <td
                    className="border-r border-slate-200 bg-slate-50/80 px-2 py-1 text-center font-mono text-[11px] text-slate-400 select-none dark:border-white/10 dark:bg-slate-800/60"
                  >
                    {rIdx + 1}
                  </td>

                  {/* Editable Data Cells */}
                  {columns.map((col, cIdx) => {
                    const isEmailCell = col === 'email';
                    const cellVal = row[cIdx] ?? '';
                    const isFocused = activeCell?.r === rIdx && activeCell?.c === cIdx;
                    const cellHasError = isEmailCell && hasEmailError;

                    return (
                      <td
                        key={cIdx}
                        role="gridcell"
                        className={`relative border-r border-slate-200 p-0 dark:border-white/10 ${
                          cellHasError ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        <input
                          ref={(el) => {
                            const key = `${rIdx}-${cIdx}`;
                            if (el) cellInputRefs.current.set(key, el);
                            else cellInputRefs.current.delete(key);
                          }}
                          type="text"
                          value={cellVal}
                          onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                          onFocus={() => setActiveCell({ r: rIdx, c: cIdx })}
                          onKeyDown={(e) => handleCellKeyDown(e, rIdx, cIdx)}
                          onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                          aria-label={`Row ${rIdx + 1}, column ${col}`}
                          placeholder={isEmailCell && rIdx === 0 ? 'recipient@example.com' : ''}
                          className={`w-full bg-transparent px-2.5 py-1.5 text-xs text-slate-900 outline-none transition dark:text-slate-100 ${
                            isFocused
                              ? 'ring-2 ring-inset ring-amber-500 bg-amber-50/30 dark:bg-amber-950/20'
                              : ''
                          } ${isEmailCell ? 'font-mono text-[11.5px]' : ''}`}
                        />
                        {cellHasError && (
                          <span
                            title="Invalid email address format"
                            className="absolute right-1.5 top-2 text-rose-500"
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </td>
                    );
                  })}

                  {/* Row Delete Action */}
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      title={`Delete row ${rIdx + 1}`}
                      aria-label={`Delete row ${rIdx + 1}`}
                      onClick={() => removeRow(rIdx)}
                      className="cursor-pointer text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-600 transition"
                    >
                      <Trash2 className="mx-auto h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Status Bar / Helper Footer ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-3 py-1.5 text-[11px] text-slate-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <strong>{validRecipientsCount}</strong> valid recipient{validRecipientsCount === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>Press <strong>Enter</strong> to move down (or add row), <strong>Tab</strong> to move next</span>
        </div>
        <div>
          <span>Tip: Paste copied cells directly from <strong>Excel</strong> or <strong>Google Sheets</strong></span>
        </div>
      </div>
    </div>
  );
}
