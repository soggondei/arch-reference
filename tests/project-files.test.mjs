import assert from 'node:assert/strict';
import test from 'node:test';
import { fileAttributes, MAX_PROJECT_FILE_BYTES, validFileLink, validFileName } from '../lib/project-files.ts';

test('architecture file originals retain Unicode names and unknown extensions with a bounded size', () => {
  for (const name of ['도면 A-101.dwg', '계획안 (3차).3dm', '새 모형.사용자형식']) assert.ok(validFileName(name));
  for (const name of ['  ', '.', '..', 'a/b.png', 'a\\b.pdf', 'X\nA.jpg', null, 'a'.repeat(241)]) assert.equal(validFileName(name), false);
  assert.equal(MAX_PROJECT_FILE_BYTES, 50 * 1024 * 1024);
});

test('delivery type is independent of file format and task membership can be omitted', () => {
  assert.deepEqual(fileAttributes({kind:'model',stage:'final',taskId:'도면 02'}), {kind:'model',stage:'final',taskId:'도면 02'});
  assert.deepEqual(fileAttributes({kind:'image',stage:'reference'}), {kind:'image',stage:'reference',taskId:null});
  for (const attrs of [{kind:'drawing',stage:'wrong'},{kind:'code',stage:'process'},{kind:'image',stage:'final',taskId:''}]) {
    assert.equal(fileAttributes(attrs), null);
  }
  assert.equal(validFileLink(' X '),false);
});
