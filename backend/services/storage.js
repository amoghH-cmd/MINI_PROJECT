// Storage abstraction: LocalStorage now, S3-compatible adapter can implement the same interface later.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');
const { sha256 } = require('../utils/hash');

class LocalStorage {
  constructor(root) { this.root = path.resolve(root); }
  resolve(key) {
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }
  // Random server-side name; the client-supplied name is never used on disk.
  async save(buffer, { ext = '', folder = 'documents' } = {}) {
    const safeExt = /^\.[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : '';
    const key = path.posix.join(folder, crypto.randomUUID() + safeExt);
    const full = this.resolve(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer, { mode: 0o640 });
    return { key, size: buffer.length, sha256: sha256(buffer) };
  }
  createReadStream(key) { return fs.createReadStream(this.resolve(key)); }
  async remove(key) { await fs.promises.rm(this.resolve(key), { force: true }); }
}

module.exports = { LocalStorage, storage: new LocalStorage(env.UPLOAD_DIR) };
