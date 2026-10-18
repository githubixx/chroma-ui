# Chroma UI

Reusable themes for server-rendered Go applications, extracted from
[vdradmin-go](https://github.com/githubixx/vdradmin-go).

**Work in progress:** the catalog, shared component stylesheet, configurable
navigation, optional JavaScript helpers, and standalone showcase are implemented.

All 37 original themes are embedded. The first consumer, vdradmin-go, is
integrated and verified through an explicit local Go workspace. Publication
and a portable consumer dependency pin remain the next release milestone;
there is no published release yet.

## Release readiness (no publication)

Before publishing, verify the reviewed working tree independently of VDR:

```sh
GOWORK=off go mod tidy -diff
GOWORK=off go mod verify
GOWORK=off GOFLAGS=-mod=readonly go test -race ./...
GOWORK=off GOFLAGS=-mod=readonly go vet ./...
GOWORK=off GOFLAGS=-mod=readonly go build ./...
bash scripts/test-e2e.sh
```

CI runs these standalone module and browser checks. They do not stage, commit,
tag, push, or publish anything. Publication remains a manual, post-review
decision; there is no automated publishing workflow.

Once you have reviewed, committed, and published the chosen library revision,
consumers can pin its exact real Go module version. VDR's
[release-readiness handoff](https://github.com/githubixx/vdradmin-go#release-readiness-and-post-review-handoff)
then checks the consumer with workspace mode disabled. Its standalone CI and
default Docker builds intentionally remain blocked until that dependency pin
exists. A successful local workspace build is not a substitute.

## Standalone showcase

```sh
go run ./examples/showcase -addr 127.0.0.1:18764 -assets-prefix /demo/skin
```

Open <http://127.0.0.1:18764/>. Switch between **Memory Desk** and **Mail Console** to see application-owned branding, menus, active links, display badges, action labels, text icons, and inline SVG buttons using the same shared components. These are presentation examples. Demo action buttons do not modify data.

Try all 37 themes and System mode, mobile widths, and the native-select toggle.
The showcase embeds its page and shared assets into its binary; it does not
need a VDR checkout or working-directory-relative asset files.

## Foundation API

Requires Go 1.26 or newer. Import path: `github.com/githubixx/chroma-ui`,
package name: `chromaui`.

```go
catalog, err := chromaui.NewCatalog(nil)
if err != nil {
    return err
}

mux := http.NewServeMux()
mux.Handle("/ui/", http.StripPrefix("/ui", catalog.Handler(logger)))
```

This exposes shared assets, `/ui/themes/<id>/theme.css`, and each theme's
`assets/` files.
Render the selected ID on the document root:

```html
<html data-theme="light">
<head>
  <link rel="stylesheet" href="/ui/css/base.css">
  <!-- Application layout stylesheet goes here. -->
  <link rel="stylesheet" href="/ui/themes/light/theme.css">
  <!-- Optional, narrowly scoped application compatibility styles go last. -->
  <script src="/ui/js/theme.js"></script>
  <script defer src="/ui/js/menu.js"></script>
  <!-- Optional: omit this script to retain native selects. -->
  <script defer src="/ui/js/select.js"></script>
</head>
```

Theme styles define presentation variables, including `--font-sans`,
`--font-display`, `--primary-color`, `--bg-color`, `--bg-image`,
`--surface-color`, `--text-color`, `--text-muted`, `--border-color`, `--shadow`,
`--radius`, and `--spacing`. `--surface-color` can contain a gradient: use it
with `background`, not `background-color`.

Keep stylesheet ordering **shared foundation → application layout → selected
theme → application compatibility adjustments**. For System mode, omit the
`data-theme` attribute and selected-theme link; the shared stylesheet follows
`prefers-color-scheme` and updates when the OS preference changes.

Applications own theme selection, persistence, routes, authorization, domain
layout, and all navigation/button content. `system` is a selection mode, not a
catalog theme. An explicit server-rendered theme is never replaced by the
bootstrap. `data-theme-default` optionally supplies an explicit server fallback;
if used, include that theme's stylesheet too. Omitted or `system` defaults
leave `data-theme` unset. The helpers never persist a selection in cookies or
local storage. Google Fonts imports remain unchanged and require network
access in production.

Catalog metadata includes `Theme.Bundled`, which identifies the selected source
after whole-theme overrides are applied. Applications can use it to gate
built-in-theme-specific compatibility rules without applying them to a local
replacement with the same ID. This value is assigned by the catalog, not YAML.

### Bundled themes

| ID | Visual family |
| --- | --- |
| `light` | Light neutral surfaces |
| `dark` | Dark neutral surfaces |
| `aurora-glass-1` | Aurora artwork, glass panels, and framed controls |
| `cartoon-1` | Rounded, colorful panels and Fredoka typography |
| `fitness` | High-energy colors and textured surfaces |
| `glas-1` | Light glass surfaces |
| `gold-1` | Gold accents and polished surfaces |
| `golden-moon` | Lunar artwork and SVG button treatments |
| `lighting-1` | Luminous panels and electric accents |
| `luxury-1` | Glossy panels and pill controls |
| `mantle-1` | Charcoal panels, gradient accents, and serif headings |
| `metal-1` | Metallic gradients and panel flares |
| `retro-arcade` | Pixel typography, noise, and arcade effects |
| `solar-system-1` | Solar-system background artwork |
| `space-night-1` | Responsive night-sky artwork |
| `spaceship-2` | Sharp SVG-framed controls, panels, and state fills |
| `spaceship-<color>-<dark\|light>` | 20 HUD palettes with angular decorations |
| `crt-starfield-1` | CRT/starfield artwork and restrained comet animation |

Spaceship palette colors are `blue`, `cyan`, `green`, `grey`, `magenta`,
`mono`, `orange`, `purple`, `red`, and `yellow`. Both accent variants retain
their original dark color scheme; `light` means lighter accents, not a light
page background.

Original theme IDs and metadata are retained. Artwork URLs are theme-relative,
so mounting assets below an application-chosen prefix works without root-level
static routes. CRT desktop/mobile backgrounds, reduced-motion behavior, and
print suppression are preserved.
For artwork stored in a custom property, the theme consumes that property in
its own stylesheet (for example, a theme-local `body` background rule). CSS
resolves relative URLs where a property is consumed; consuming the same
relative token only from the shared stylesheet would target its `css/` folder.

Domain list selectors are mapped to `.ui-item` and its subcomponents; domain
activity/warning/error states use `.is-active`, `.is-warning`, and `.is-error`.
An inactive item uses `.is-inactive`, independently of disabled form controls.
Retro Arcade's generic active item uses healthy success styling, rather than
the source application's recording-specific pink. A consumer retaining that
domain-specific recording color can apply it in its compatibility stylesheet.
Watch TV, channel/timer timelines, application columns, and other page-specific
rules are deliberately not part of the library. Consumers retain those rules
in their own compatibility stylesheet. This includes Metal's channel-day pill
and CRT's mobile channel/timer adjustments.

## Components and navigation

The CSS contract retains familiar hooks from the original UI:

| Hook | Purpose |
| --- | --- |
| `.container` | Centered, responsive content width |
| `.card`, `.panel` | Generic surfaces |
| `.toolbar` | Wrapping control/action grouping |
| `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger` | Buttons/links; content belongs to the application |
| `.badge` | Display badge, not an authorization mechanism |
| `.ui-list`, `.ui-item` | Generic list items, without VDR-specific class names |
| `.ui-item.is-active`, `.is-warning`, `.is-error` | Healthy activity, attention, and error states |
| `.ui-item.is-inactive` | Muted inactive item, not an error |
| `.form-grid`, `.radio-group`, `.form-actions` | Form layout helpers |
| `.data-table` | Styled table, with optional `tr.is-selected` and `td.actions` |
| `.progress` → `.progress-bar` | Progress track/bar; set bar width for determinate progress |
| `.nav-brand`, `.nav-right`, `.nav-burger`, `.nav-burger-menu` | Compatible navigation markup |

### Item state color contract

Every bundled theme and custom theme must preserve these meanings:

| Item state | Required border or frame accent | Meaning |
| --- | --- | --- |
| `.ui-item` without a state | Ordinary theme border, distinct from active | No status implied |
| `.ui-item.is-active` | Green | Healthy activity, not an error or recording-specific danger state |
| `.ui-item.is-warning` | Yellow or orange | Attention needed |
| `.ui-item.is-error` | Red | Error or intervention needed |
| `.ui-item.is-inactive` | Muted, visually distinct from active | Inactive, not an error |

Exact shades, glow, backgrounds, and decorative details may match the theme,
but must not swap these hues or replace them with a monochrome palette.
A visible colored edge is sufficient in general; Spaceship themes use the
semantic color around the full border, including HUD corner decorations.
SVG-framed themes must color the frame itself, not only the content inside it.
Default items must not reuse the active
status border. Keep text or icons alongside color so status is not conveyed by
color alone.

Button palettes and application-specific states are separate: consumers may
retain a legacy recording treatment in their own compatibility stylesheet
without redefining the generic item meanings.

Item subcomponents are `.ui-item-info` (containing an `h3`),
`.ui-item-subtitle`, `.ui-item-meta`, and `.ui-item-actions`. Indeterminate
progress adds `.progress-indeterminate` to the track; supply appropriate
progress ARIA attributes in application markup. Native `<progress>` does not
use the shared progress classes.

Gold 1, Luxury 1, and Solar System 1 retain their decorative palettes, but generic
active/error items use green/red borders so their status remains recognizable.
Lighting 1 uses its neon green for healthy activity, including the edge glow,
and reserves its neon red for errors.

Inputs, selects, textareas, tables, and progress presentation are demonstrated
in the showcase. The application still owns page/domain layouts.
Generic spaceship-family effects accompany the bundled HUD themes.

For themed form controls, use `.form-grid` with direct label/control pairs.
Text inputs need an explicit supported `type` attribute:

```html
<form class="form-grid">
  <label for="title">Title</label>
  <input type="text" id="title" name="title">
  <label for="notes">Notes</label>
  <textarea id="notes" name="notes"></textarea>
</form>
```

The shared input selectors cover `text`, `number`, `password`, `date`, and
`time`. Other application-specific control types can be styled by the consumer.

Add shared partials to an application's `html/template` set:

```go
templates, err := chromaui.ParseTemplates(template.New("application"))
if err != nil {
    return err
}
// Parse application pages into the same set, then render:
header := chromaui.Header{
    Brand: "Memory Desk", BrandHref: "/memories", PageTitle: "Albums",
    Badge: "Curator", MenuLabel: "Navigate", NavigationLabel: "Collections",
    Items: []chromaui.MenuItem{
        {Label: "Memories", Href: "/memories", Icon: "+"},
        {Label: "Albums", Href: "/albums", Icon: "#", Active: true},
    },
}
err = templates.ExecuteTemplate(w, "chroma/header", header)
```

Alternatively, call `{{template "chroma/header" .Header}}` from an application
page. `BrandHref` defaults to `/`, `MenuLabel` to `Menu`, and `NavigationLabel`
to `Primary`. Empty page titles, badges, and icons are omitted. All text/icons
are HTML-escaped and URLs use Go's contextual escaping; no trusted HTML is
required. Applications filter visible items and enforce backend authorization.

Buttons are normal HTML: choose any label or text symbol. Put application-owned
SVG in your own templates, as the showcase does; there is no icon-font, VDR
menu, or htmx dependency.

### Optional JavaScript

- `theme.js`: load in the head to honor server selection/defaults before
  rendering; the CSS handles System mode.
- `menu.js`: load with `defer` for outside-click closing and Escape focus
  restoration. Native `<details>` navigation works without JavaScript. Dynamic
  navigation works through event delegation.
- `select.js`: optional enhancement using the original custom-select visual
  hooks. Native controls retain their IDs, names, values, and form behavior.
  Disabled, multiple, listbox (`size`), and explicitly hidden selects are not
  enhanced. Use `class="is-pill"` on a select for the optional pill appearance.

Enhanced selects support labels, Arrow Up/Down, Home/End, Enter/Space,
Escape/Tab, disabled-option skipping, visible validation focus, and form
reset. Selection dispatches one native `input` and `change` event; the helper
does **not** separately submit forms already handled by `onchange`.
Opening a long dropdown scrolls its current selection into the list's visible
area without scrolling the enclosing card or page.
An open enhanced select raises its enclosing card/panel/item above sibling
surfaces, including hovered or filtered cards. Metal temporarily permits
overflow on that surface while the dropdown is open, without changing its
closed-panel clipping or flare treatment.
Metal dropdowns retain the metallic gradient over an opaque backing so page
content cannot show through; highlighted options use dark text on the light
metallic fill.
The other bundled themes likewise keep floating option lists opaque and their
selected text readable; translucent panel styling is not used as a substitute
for a dropdown backing.

The scripts use the `window.ChromaUI` namespace and avoid duplicate
initialization. Call `window.ChromaUI.initSelects(root)` after inserting a
fragment; the root itself can be a select. `htmx:load` events are also handled
without importing htmx. When changing native values/options programmatically,
dispatch a `change` event to refresh an existing widget.

## Local theme overrides

`NewCatalog` accepts an optional `fs.FS` whose root contains theme directories:

```text
themes/
  light/
    theme.yaml
    theme.css
    assets/
      panel.svg
```

Each theme requires a readable, nonempty stylesheet and a single YAML document:

```yaml
name: My Light Theme
author: Example
description: Application-specific Light replacement
version: 1.0.0
```

`name` is required; the other three fields are optional. Unknown metadata fields
are errors. IDs come from directory names and must be lowercase alphanumeric
words separated by hyphens. `system` is reserved.

For directories on disk, use `os.OpenRoot` and pass `root.FS()`; keep the root
open for the lifetime of the catalog and its handlers. Unlike `os.DirFS`, this
confines filesystem access even if links change concurrently. Symbolic-link
theme directories and detectable links in metadata/public asset paths are
rejected. A supplied filesystem is trusted to enforce its own namespace.

An optional override directory that does not exist can be omitted by the
application (`NewCatalog(nil)`); other opening errors must be reported. If a
filesystem is supplied, failure to read its root is an error, not an empty
catalog.

A local theme **replaces the entire bundled theme with that ID**. Missing
local artwork never falls back to bundled artwork. Use relative CSS references
such as `url(assets/panel.svg)` so assets work under any mount prefix.

`catalog.Themes()` returns independent metadata values sorted by ID.
`catalog.Theme(id)` performs an exact lookup. Invalid themes return a
`*chromaui.ThemeError` identifying the source, ID, and file; use `errors.As`
or `errors.Is` to inspect errors.

Call `catalog.Reload()` after adding/removing themes or changing metadata.
It validates the full replacement before publishing it; a failure leaves the
previous metadata and source selection intact. Assets are read live, not
snapshotted: CSS edits appear on browser refresh without a reload. Invalid or
removed source files are reported rather than silently replaced with bundled
content. Applications should serialize filesystem changes with discovery if
they need a consistent on-disk update.

## HTTP contract

- Mount below a prefix with the standard library's `http.StripPrefix`.
- Only `GET` and `HEAD` are supported.
- Public paths are `/themes/<id>/theme.css` and image/font files inside
  `/themes/<id>/assets/`, plus `/css/base.css`, `/js/theme.js`, `/js/menu.js`,
  and `/js/select.js`.
- Supported asset extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`,
  `.avif`, `.svg`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.otf`.
- Metadata, hidden paths, other file types, and directory listings are not
  exposed. Missing/invalid public paths return 404.
- Unexpected I/O errors return 500 and are logged with `log/slog`; a nil logger
  uses `slog.Default()`. No fallback hides failed overrides.
- Assets use `Cache-Control: no-cache`, content-based ETags, conditional
  requests, and range/HEAD support. Middleware and access policy remain with
  the application.

## Validation

```sh
go test -race ./...
go vet ./...
go build ./...
bash scripts/test-e2e.sh
```

The browser runner needs Docker, not host Node/browser installations. It builds
the standalone showcase with Go 1.26 and runs Chromium and Firefox in pinned
Playwright 1.64.1 Ubuntu amd64. Tests exercise both example applications,
desktop/mobile layout, all bundled themes and System mode, mounted artwork,
motion preferences, SVG frames/state fills, menus, keyboard and
pointer selects, reset/validation, dynamic fragments, single change handling,
and no-JavaScript fallback. These are behavior/layout tests, not replacement
screenshots for the VDR migration baseline.

The matrix covers both sample applications at 1440px and 390px for every
bundled theme. Open-list checks compare pixels while changing the panels
underneath, check selected-text contrast, scroll to and click the last option,
and ensure the host card is not scrolled to compensate for clipping. Long-list
tests also verify the current selection is visible without a page jump.

Actual Google Fonts resources are hash-locked in
`test/e2e/resources.lock.json`; browser HTTPS requests are fulfilled from a
verified test-only cache. Missing/unregistered resources fail tests. Reports,
screenshots, and traces go to ignored `test-results/` and `playwright-report/`.
To deliberately update font resources, use Node.js 22+:

```sh
npm run test:e2e:resources:update
```

Review the lock changes before accepting them. Do not replace fonts with
silent system-font fallbacks. Browser selectors can be passed to the runner,
for example `bash scripts/test-e2e.sh --project=firefox`.

Develop against an unpublished checkout with an external Go workspace, not a
committed local `replace` directive. Consumers must eventually pin a real
published revision; do not invent a release version.

## License and attribution

GPL-3.0-or-later; see [LICENSE](LICENSE). The bundled themes originate
from `web/themes/` in
[githubixx/vdradmin-go](https://github.com/githubixx/vdradmin-go) and retain their
original metadata and attribution. The shared CSS, header structure, bootstrap,
menu behavior, and optional select helper are derived from the original
`web/static/css/base.css`, `web/templates/_nav.html`, and
`web/static/js/theme.js`; application-specific layout and policy are excluded.
The CRT runtime WebP images derive from the user's original generated CRT
artwork, as documented in the source project's
[theme guide](https://github.com/githubixx/vdradmin-go/blob/main/docs/THEMES.md).
Within the CRT theme, only `crt-hero-fade.webp` and `crt-sky.webp` are bundled,
not the source PNG.
Metadata and runtime artwork are checked against original SHA-256 fingerprints;
no reference-site images or logos are included.

The other runtime artwork comes from the corresponding original theme asset
directories: Aurora's AVIF/WebP backgrounds and SVG gloss overlays, Fitness
and Retro noise SVGs, Golden Moon's background SVG, Luxury's gloss SVGs, Solar
System's background PNG, and Space Night's AVIF/WebP/PNG background variants.
Space Night's PNGs remain runtime fallbacks. Unreferenced source images, Aurora
frame-regeneration PNGs, and unused alternative SVGs are not bundled.
