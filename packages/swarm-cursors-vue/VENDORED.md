# Upstream snapshot

`swarm-cursors-vue` retains its 1.4.1 package version and uses an unreleased
candidate from Cyrene2008/swarm-cursors-vue, commit
`3b62c7b600ea5738aed1e5a30a6acee0a117d90d` on
`Demiurge/nameroller-reveal-alignment`. This snapshot includes CyTime's replay
and live glyph work plus NameRoller's scrolling, text alignment, and handoff fixes.

The app snapshot is based on that commit. It carries a downstream patch to
`src/engine-runtime.js` that keeps native button layout, honors form text
alignment, and counts thin strokes before revealing the real page. The
committed `dist/` was rebuilt from this patched source with the base commit's
build script and lockfile. Preserve or reconcile the patch on upgrade.

The MIT terms apply to the respective Nitin Thakur and Cyrene2008 contributions.
They do not grant rights to inherited Swarm code. See [LICENSE](LICENSE) and
[NOTICE.md](NOTICE.md) for the attribution chain and upstream permission status.
