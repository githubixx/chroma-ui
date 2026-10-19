# Chroma UI agent guidelines

## Scope and architecture

- Chroma UI is a reusable Go library for server-rendered applications, not an
  application server or frontend framework. See [README.md](README.md) for its
  public API, asset, theme, and component contracts.
- Keep branding, menus, button content, routes, authorization, theme selection
  and persistence, and domain-specific layouts in consumers. Do not introduce
  application-specific policy into shared components.
- Catalog and HTTP behavior live in the root Go package; shared presentation
  lives in [assets/](assets/) and [templates/](templates/). The
  [showcase](examples/showcase/) demonstrates two independent consumers and
  must remain runnable without another repository or working-directory assets.
- Preserve existing theme IDs, metadata, attribution, and runtime artwork.
  The library is GPL-3.0-or-later; retain applicable license notices.

## Working approach

- Inspect relevant code, tests, and documentation before editing. Prefer the
  simplest complete fix, reuse existing helpers, and avoid unrelated changes.
- Plan non-trivial changes and their verification before implementation.
  Clarify consequential scope or behavior decisions; re-plan when evidence
  invalidates the approach. Keep simple fixes lightweight.
- Fix root causes and add focused regressions. Preserve unrelated worktree
  changes; do not weaken tests or regenerate expectations to hide regressions.
- Keep changes surgical and update directly related documentation. Use
  idiomatic, formatted Go and existing CSS/JavaScript conventions.
- Report invalid input and I/O failures through the established error/logging
  contracts. Do not silently replace failed overrides with bundled content.
- Keep task notes in session tracking unless repository documentation is
  requested. Do not create duplicate TODO or lessons files by default.

## Theme and component rules

- Preserve stylesheet order: shared foundation, application layout, selected
  theme, then application compatibility adjustments. Consumer-specific legacy
  styling belongs in the consumer, not in this library.
- Local themes replace a whole theme, including artwork; do not add per-file
  bundled fallbacks. Catalog reloads must validate before publishing changes.
  `Theme.Bundled` is catalog-owned provenance, never trusted YAML input.
- Assets must work under arbitrary mount prefixes. Keep artwork URLs relative
  to their theme and consume relative-URL custom properties in theme-local CSS.
  Surface tokens can contain gradients; do not assume a plain background color.
- Follow the [item state color contract](README.md#item-state-color-contract):
  active green, warning yellow/orange, error red, inactive muted, and default
  distinct from active. Do not remap global button palettes merely to fix item
  states. Spaceship status borders must be colored on all four sides, including
  HUD corners; SVG frames must visibly render their semantic colors.
- Preserve keyboard access, labels, focus behavior, reduced motion, responsive
  layouts, System mode, and usable native controls without JavaScript. Optional
  helpers must not take ownership of consumer persistence or application policy.

## Verification

- Run the smallest existing checks covering the change, expanding to the
  affected theme/application/browser matrix when shared behavior changes.
  Documentation-only edits do not require builds or browser tests.
- Verify the library independently of consumer workspaces. The Go version in
  [go.mod](go.mod) and [CI](.github/workflows/ci.yml) is the supported minimum;
  changes must work there, not only with a newer installed toolchain.

  ```sh
  GOWORK=off go mod tidy -diff
  GOWORK=off go mod verify
  GOWORK=off GOFLAGS=-mod=readonly go test -race ./...
  GOWORK=off GOFLAGS=-mod=readonly go vet ./...
  GOWORK=off GOFLAGS=-mod=readonly go build ./...
  bash scripts/test-e2e.sh
  ```

- The browser runner uses Docker with pinned Playwright browsers. Pass focused
  selectors through it, for example:
  `bash scripts/test-e2e.sh --project=chromium --grep spaceship`.
- For presentation changes, check both showcase applications, desktop/mobile,
  and Chromium/Firefox as appropriate. Inspect representative screenshots;
  computed colors alone do not prove visible borders, SVG strokes, corner
  decorations, dropdown opacity, or text contrast.
- Keep hash-locked external resources and original artwork fingerprints intact.
  Resource updates must be deliberate and reviewed, not silent font fallbacks.
- If testing a consumer checkout, use an external Go workspace. Preserve its
  approved visual baselines; do not refresh consumer screenshots without
  explicit approval. A workspace build does not prove standalone release
  readiness.
- Before reporting completion, summarize the actual checks and any remaining
  limitations. Never claim an unrun or failing check passed.

## Git and release boundaries

- Leave changes unstaged and uncommitted unless explicitly authorized.
  Continuing implementation does not authorize staging, commits, merges,
  tags, pushes, or publication.
- Do not commit local workspace files or local `replace` directives, invent
  release versions, or pin consumers to unpublished versions. Follow the
  [release-readiness guidance](README.md#release-readiness) only
  when the corresponding review/publication actions are authorized.
