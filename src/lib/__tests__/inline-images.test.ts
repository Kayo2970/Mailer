import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cidFor, findImageIds, imageTag, imageToken, imageTokensToHtml, replaceImageRefs, sniffImageType, stripImageTokens } from '../inline-images.ts';

const A = 'img_0123456789abcdef';
const B = 'img_fedcba9876543210';

test('a token becomes an <img> that points at the embedded copy, never at a URL', () => {
  const html = imageTokensToHtml(`Hello\n${imageToken(A)}\nBye ${imageToken(B, 300)}`);
  assert.match(html, new RegExp(`<img src="cid:${cidFor(A)}"`));
  assert.match(html, new RegExp(`<img src="cid:${cidFor(B)}" alt="" width="300"`));
  assert.doesNotMatch(html, /https?:|\[\[/);
});

test('malformed tokens are left as typed', () => {
  for (const t of ['[[image:nope]]', '[[image:img_SHOUTING1234]]', '[[image:img_0123456789abcdef|abc]]']) {
    assert.equal(imageTokensToHtml(t), t);
  }
});

test('tokens are dropped from the plain-text part', () => {
  assert.equal(stripImageTokens(`Hi\n\n${imageToken(A)}\n\nBye`), 'Hi\n\nBye');
});

test('findImageIds lists each referenced image once', () => {
  const html = imageTag(A) + imageTag(B) + imageTag(A) + '<img src="cid:other@elsewhere">';
  assert.deepEqual(findImageIds(html), [A, B]);
});

test('replaceImageRefs swaps known references and leaves unknown ones', () => {
  const out = replaceImageRefs(imageTag(A) + imageTag(B), (id) => (id === A ? 'data:image/png;base64,AAAA' : undefined));
  assert.match(out, /src="data:image\/png;base64,AAAA"/);
  assert.match(out, new RegExp(`src="cid:${cidFor(B)}"`));
});

test('sniffImageType goes by the bytes, and refuses anything that is not PNG/JPEG/GIF', () => {
  assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.contentType, 'image/png');
  assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))?.ext, 'jpg');
  assert.equal(sniffImageType(new TextEncoder().encode('GIF89a'))?.contentType, 'image/gif');
  assert.equal(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
});
