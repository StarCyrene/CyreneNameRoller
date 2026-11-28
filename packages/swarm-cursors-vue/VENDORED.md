# Upstream snapshot

`swarm-cursors-vue` retains its 1.4.1 package version and uses an unreleased
candidate from Cyrene2008/swarm-cursors-vue, commit
`3b62c7b600ea5738aed1e5a30a6acee0a117d90d` on
`Demiurge/nameroller-reveal-alignment`. This snapshot includes CyTime's replay
and live glyph work plus NameRoller's scrolling, text alignment, and handoff fixes.

The package manifest, `src/`, distribution (including every chunk and the
TypeScript declarations), and upstream documentation and license files are
exact Git blobs from that commit. Replace them together on upgrade. This app
consumes the committed `dist/`; use the pinned upstream checkout for package
builds and tests.

The MIT terms apply to the respective Nitin Thakur and Cyrene2008 contributions.
They do not grant rights to inherited Swarm code. See [LICENSE](LICENSE) and
[NOTICE.md](NOTICE.md) for the attribution chain and upstream permission status.
