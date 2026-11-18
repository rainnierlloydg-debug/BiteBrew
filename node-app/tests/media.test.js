import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { config } from '../server/config.js';
import { saveMedia, readMedia, mediaExists } from '../server/services/media.js';

test('private cloud media preserves filenames, handles duplicate seeds and blocks traversal', async t => {
  const stored = new Map(), paths = [];
  const server = createServer(async (req, res) => {
    paths.push(req.url);
    assert.equal(req.headers.apikey, 'fixture-storage-key');
    assert.equal(req.headers.authorization, 'Bearer fixture-storage-key');
    const name = req.url.split('/').at(-1);
    if (req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      if (stored.has(name) && req.headers['x-upsert'] !== 'true') { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ statusCode: '400', error: 'Duplicate', message: 'Asset already exists' })); return; }
      stored.set(name, Buffer.concat(chunks)); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ Key: 'bitebrew-media/' + name })); return;
    }
    if (!stored.has(name)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'image/webp' }); res.end(stored.get(name));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = { url: config.storageUrl, key: config.storageKey };
  config.storageUrl = 'http://127.0.0.1:' + server.address().port; config.storageKey = 'fixture-storage-key';
  t.after(async () => { config.storageUrl = previous.url; config.storageKey = previous.key; await new Promise(resolve => server.close(resolve)); });
  const bytes = Buffer.from('fixture image bytes');
  await saveMedia('fixture.webp', bytes, { ifAbsent: true });
  await saveMedia('fixture.webp', Buffer.from('should not replace'), { ifAbsent: true });
  assert.deepEqual(await readMedia('fixture.webp'), bytes);
  assert.equal(await mediaExists('fixture.webp'), true); assert.equal(await mediaExists('missing.webp'), false);
  const requests = paths.length;
  await assert.rejects(readMedia('../.env'), { status: 404 });
  await assert.rejects(saveMedia('../bad.webp', bytes), { status: 422 });
  assert.equal(paths.length, requests);
});
