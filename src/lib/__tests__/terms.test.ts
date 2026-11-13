import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHOR, CREDIT_LINE, TERMS_SECTIONS, termsAsMarkdown } from '../terms.ts';

test('TERMS.md is the text the pop-up shows (regenerate it when terms.ts changes)', () => {
  assert.equal(readFileSync(new URL('../../../TERMS.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), termsAsMarkdown());
});

test('the terms name the author, credit them, and waive liability for misuse', () => {
  assert.match(CREDIT_LINE, new RegExp(AUTHOR));
  const text = TERMS_SECTIONS.map((s) => s.title + s.paragraphs.join(' ')).join(' ');
  assert.match(text, /WAIVES AND DISCLAIMS ALL LIABILITY FOR ANY MISUSE/);
});
