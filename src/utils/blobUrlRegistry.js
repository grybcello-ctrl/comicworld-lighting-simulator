/**
 * Tracks every object URL created for one custom model so it can be revoked
 * in a single place. The registry is owned by whoever owns the model:
 *   - while loading: the loader (revokes it on error / cancel)
 *   - after a successful load: the subject store (revokes it when the model is
 *     replaced or removed, together with disposing geometry/materials/textures)
 * Revoking is idempotent, so double clean-up is harmless.
 */
export function createBlobUrlRegistry() {
  /** @type {string[]} */
  const urls = [];
  let revoked = false;

  return {
    /** URL.createObjectURL(blob), recorded for later revocation. */
    create(blob) {
      if (revoked) throw new Error('Blob URL registry was already revoked.');
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return url;
    },
    /** Snapshot of the tracked URLs. */
    get urls() {
      return [...urls];
    },
    get size() {
      return urls.length;
    },
    get isRevoked() {
      return revoked;
    },
    /** Revokes every tracked URL; returns how many were revoked by this call. */
    revokeAll() {
      const count = urls.length;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
      revoked = true;
      return count;
    },
  };
}
