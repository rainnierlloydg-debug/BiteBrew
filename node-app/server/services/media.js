import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { fail } from '../lib/errors.js';

const validName = name => typeof name === 'string' && /^[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/.test(name) && !name.startsWith('.');
const contentType = name => name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : 'image/jpeg';
let storage;
function bucket() {
  storage ||= createClient(config.storageUrl, config.storageKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return storage.storage.from(config.storageBucket);
}
export const remoteMedia = () => Boolean(config.storageUrl && config.storageKey);
export async function saveMedia(name, bytes, { ifAbsent = false } = {}) {
  if (!validName(name)) fail(422, 'IMAGE_PATH', 'Invalid image filename.');
  if (remoteMedia()) {
    const { error } = await bucket().upload(name, bytes, { contentType: contentType(name), upsert: !ifAbsent });
    if (error && !(ifAbsent && (String(error.statusCode) === '409' || /already exists|duplicate/i.test(error.message)))) fail(503, 'MEDIA_UNAVAILABLE', 'The image could not be stored.');
  } else {
    await fs.mkdir(config.uploads, { recursive: true });
    try { await fs.writeFile(path.join(config.uploads, name), bytes, ifAbsent ? { flag: 'wx' } : {}); }
    catch (error) { if (!ifAbsent || error.code !== 'EEXIST') throw error; }
  }
}
export async function readMedia(name) {
  if (!validName(name)) fail(404, 'NOT_FOUND', 'Image unavailable.');
  if (!remoteMedia()) {
    try { return await fs.readFile(path.join(config.uploads, name)); }
    catch (error) { if (error.code === 'ENOENT') fail(404, 'NOT_FOUND', 'Image unavailable.'); throw error; }
  }
  const { data, error } = await bucket().download(name);
  if (error) {
    if (String(error.statusCode) === '404' || /not found|not_found/i.test(error.message)) fail(404, 'NOT_FOUND', 'Image unavailable.');
    fail(503, 'MEDIA_UNAVAILABLE', 'The image could not be loaded.');
  }
  return Buffer.from(await data.arrayBuffer());
}
export async function mediaExists(name) {
  try { await readMedia(name); return true; }
  catch (error) { if (error.status === 404) return false; throw error; }
}
export async function serveMedia(res, name) {
  const bytes = await readMedia(name);
  res.type(contentType(name)).send(bytes);
}
