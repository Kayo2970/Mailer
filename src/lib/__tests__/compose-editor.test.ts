import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editorHtmlToEmailHtml,
  emailHtmlToEditorHtml,
  htmlToPlainText,
  isRichHtmlEmpty,
  normalizeRecipientEntry,
  plainTextToHtml,
} from '../compose-editor.ts';

test('round-trips cid images between email HTML and editor HTML', () => {
  const emailHtml = '<p>Hello</p><img src="cid:img_abc12345@mailer" alt="" width="300" style="width: 300px; max-width: 100%; height: auto; border: 0; display: block;">';
  const editorHtml = emailHtmlToEditorHtml(emailHtml);
  assert.match(editorHtml, /src="\/api\/images\/img_abc12345"/);
  assert.match(editorHtml, /data-mailer-image="img_abc12345"/);

  const serialized = editorHtmlToEmailHtml(editorHtml);
  assert.match(serialized, /src="cid:img_abc12345@mailer"/);
  assert.match(serialized, /width="300"/);
  assert.doesNotMatch(serialized, /data-mailer-image/);
});

test('plain text <-> HTML conversion preserves image tokens and line breaks', () => {
  const plain = 'Hi {{name}},\n\n[[image:img_abc12345|320]]\n\nBest,\nTeam';
  const html = plainTextToHtml(plain);
  assert.match(html, /<p>Hi \{\{name\}\},<\/p>/);
  assert.match(html, /src="cid:img_abc12345@mailer"/);
  assert.match(html, /width="320"/);

  const back = htmlToPlainText(html, { preserveImageTokens: true });
  assert.equal(back, 'Hi {{name}},\n\n[[image:img_abc12345|320]]\n\nBest,\nTeam');
  assert.equal(htmlToPlainText(html, { preserveImageTokens: false }), 'Hi {{name}},\n\nBest,\nTeam');
});

test('isRichHtmlEmpty detects empty markup vs text or images', () => {
  assert.equal(isRichHtmlEmpty('<p><br></p><div>&nbsp;</div>'), true);
  assert.equal(isRichHtmlEmpty('<p>Hello</p>'), false);
  assert.equal(isRichHtmlEmpty('<img src="cid:img_abc12345@mailer">'), false);
});

test('normalizeRecipientEntry splits comma/semicolon-separated address lists without breaking Name, email', () => {
  assert.equal(normalizeRecipientEntry('a@x.com, Bob <b@x.com>; c@x.com'), 'a@x.com\nBob <b@x.com>\nc@x.com');
  assert.equal(normalizeRecipientEntry('Ananya Sharma, ananya@example.com'), 'Ananya Sharma, ananya@example.com');
});

