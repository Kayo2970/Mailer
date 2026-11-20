import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findSocialCidIds,
  getSocialAttachmentsForLinks,
  getSocialPngBuffer,
  normalizeHexColor,
  replaceSocialCidRefs,
  socialCid,
  socialCidId,
} from '../social-png.ts';
import { imageTag } from '../inline-images.ts';

test('normalizeHexColor formats 3-digit, 6-digit, and fallbacks', () => {
  assert.equal(normalizeHexColor('#ffffff'), 'ffffff');
  assert.equal(normalizeHexColor('#FFF'), 'ffffff');
  assert.equal(normalizeHexColor('d97706'), 'd97706');
  assert.equal(normalizeHexColor('invalid'), '475569');
});

test('socialCidId and socialCid include platform and normalized color', () => {
  assert.equal(socialCidId('LinkedIn', '#ffffff'), 'soc_linkedin_ffffff');
  assert.equal(socialCid('GitHub', '#475569'), 'soc_github_475569@mailer');
});

test('findSocialCidIds and replaceSocialCidRefs identify and replace CIDs', () => {
  const html = '<img src="cid:soc_linkedin_ffffff@mailer"><img src="cid:soc_x_ffffff@mailer">';
  assert.deepEqual(findSocialCidIds(html), ['soc_linkedin_ffffff', 'soc_x_ffffff']);

  const replaced = replaceSocialCidRefs(html, (id) => `data:image/png;${id}`);
  assert.equal(replaced, '<img src="data:image/png;soc_linkedin_ffffff"><img src="data:image/png;soc_x_ffffff">');
});

test('getSocialPngBuffer rasterizes SVG to transparent PNG buffer with correct signature', async () => {
  const buffer = await getSocialPngBuffer('linkedin', '#ffffff');
  assert.ok(buffer.length > 50);
  // PNG magic number: 0x89 0x50 0x4e 0x47
  assert.equal(buffer[0], 0x89);
  assert.equal(buffer[1], 0x50);
  assert.equal(buffer[2], 0x4e);
  assert.equal(buffer[3], 0x47);
});

test('getSocialAttachmentsForLinks returns unique attachments with CIDs', async () => {
  const links = [
    { platform: 'linkedin', url: 'https://linkedin.com/in/test' },
    { platform: 'github', url: 'https://github.com/test' },
    { platform: 'linkedin', url: 'https://linkedin.com/in/duplicate' },
    { platform: 'invalid', url: 'not-a-url' },
  ];
  const attachments = await getSocialAttachmentsForLinks(links, '#ffffff');
  assert.equal(attachments.length, 2);
  assert.equal(attachments[0].id, 'soc_linkedin_ffffff');
  assert.equal(attachments[0].filename, 'social-linkedin.png');
  assert.equal(attachments[0].cid, 'soc_linkedin_ffffff@mailer');
  assert.equal(attachments[1].id, 'soc_github_ffffff');
});

test('imageTag respects custom margin and width styles without adding default margin: 8px 0', () => {
  const tagWithMargin = imageTag('img_0123456789abcdef', {
    width: 600,
    style: 'display: block; width: 100%; margin: 0; padding: 0;',
  });
  assert.match(tagWithMargin, /margin: 0;/);
  assert.doesNotMatch(tagWithMargin, /margin: 8px/);

  const defaultTag = imageTag('img_0123456789abcdef');
  assert.match(defaultTag, /margin: 8px 0;/);
});
