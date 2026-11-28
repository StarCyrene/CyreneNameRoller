# Upstream snapshot

`swarm-cursors-vue` is vendored from Cyrene2008/swarm-cursors-vue commit
`c5e16f1d00747056e8131ee9791c767610615819` (PR #1 merge on `main`). The
package keeps upstream version 1.4.1; Bun resolves the checked-in local
directory through `file:packages/swarm-cursors-vue` and does not track a branch.

Both `src/` and `dist/` match that commit. The installed package exports
`dist/index.js` and lazy-loads `dist/chunks/engine-entry-OTOWOWCE.js`.
The preceding layout and reveal adjustments are now upstream.

The MIT terms apply to the respective Nitin Thakur and Cyrene2008 contributions.
They do not grant rights to inherited Swarm code. See [LICENSE](LICENSE) and
[NOTICE.md](NOTICE.md) for the attribution chain and upstream permission status.
