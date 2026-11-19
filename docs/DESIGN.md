# Unstakd design system — "Terminal Night + Signal"

Source of truth: [design/ui-template.html](design/ui-template.html) (bundled; open in a browser).
Readable per-screen markup extracted from it lives in [design/screens/](design/screens/):

| Screen | File | Route |
| --- | --- | --- |
| Overview | `overview.html` | `/` |
| Project · overview + domains | `project-domains.html` | `/projects/[slug]` |
| Deploy detail · live logs | `deploy-logs.html` | `/projects/[slug]/deployments/[n]` |
| New project | `new-project.html` | `/new` |

Screens not in the template (databases, env, settings, activity, login) reuse the same
parts: panel, list rows, pills, mono metadata, the log viewer.

## Themes

Dark ("Terminal Night") is the default. Light mirrors it with the same token names.
Tokens are CSS custom properties on `:root` / `[data-theme="light"]` and mapped to
Tailwind colors, so components never branch on the theme.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `bg` | `#0B0D0C` | `#F6F7F6` | Page background |
| `panel` | `#121614` | `#FFFFFF` | Cards, lists, inputs |
| `panel2` | `#1F2622` | `#E3E8E5` | Active nav, avatar, neutral pill |
| `border` | `#1F2622` | `#DCE2DE` | Card borders, row dividers |
| `border-strong` | `#2A332E` | `#C6CEC9` | Inputs, secondary buttons |
| `text` | `#E6EDE9` | `#101412` | Primary text |
| `soft` | `#B7C2BC` | `#3A443F` | Log text, secondary copy |
| `muted` | `#8A968F` | `#56615B` | Labels, metadata |
| `dim` | `#5E6A64` | `#6B7670` | Log timestamps, separators |
| `accent` | `#3DDC84` | `#157A42` | Primary buttons, brand mark, progress |
| `accent-text` | `#3DDC84` | `#157A42` | Links, "Live" text, hostnames |
| `accent-ink` | `#06150D` | `#FFFFFF` | Text on accent background |
| `ok-bg` | `#0F2218` | `#E6F4EC` | "Live" / "Active" pill background |
| `warn` | `#F5B83D` | `#9A5B00` | Building, waiting for DNS |
| `warn-bg` | `#211A0B` | `#FFF6E5` | |
| `err` | `#FF7A7A` | `#B42318` | Failed, needs attention |
| `err-bg` | `#211213` | `#FDEDEC` | |
| `err-border` | `#5C2D33` | `#F2B8B5` | |
| `log-bg` | `#070908` | `#F1F4F2` | Log viewer |
| `track` | `#1F2622` | `#E3E8E5` | Meter tracks |

Theme selection: `system` (follows `prefers-color-scheme`) → user override `dark`/`light`,
stored in a cookie so the server renders the right theme with no flash. The header
toggle is a pill button with a sun/moon icon and an `aria-label` naming the target mode.

## Type

- **Inter** — UI text, 14px base.
- **JetBrains Mono** — brand wordmark, hostnames, SHAs, timings, logs, inputs for
  technical values (subdomain, port, env keys), the `/` search field.
- **Space Grotesk** — display numbers and headings (h1 46/40/34px, -0.03em tracking,
  stat values 36px).

## Parts

- **Brand mark**: 10×18 accent block + `unstakd` in mono bold 16px.
- **Panel**: `panel` bg, 1px `border`, 12px radius, 18–28px padding.
- **List**: one bordered panel, rows separated by `border-top`, rows 16px×20px padding.
- **Pill (status)**: 999px radius, 3px×10px, 12px semibold. Live = `ok-bg`/`accent-text`;
  Building = `warn-bg`/`warn`; Failed = `err-bg`/`err`; Standby = `panel2`/`muted`;
  Waiting = transparent with 1px `warn` border.
- **Buttons**: 44px tall (52px for the main CTA), 8px radius. Primary = `accent` bg +
  `accent-ink` bold text. Secondary = 1px `border-strong`, `panel` bg.
- **Inputs**: 44–46px, 8px radius, 1px `border-strong`, `panel` bg; mono for technical values.
- **Step track** (deploy): 6-column grid, each step has a 3px top border colored by state.
- **Log viewer**: `log-bg`, mono 13px / 1.75, timestamps in `dim`, warnings `warn`,
  errors `err`; tab bar for build / runtime.
- **Layout**: max width 1200px, 32px side padding (16px on mobile), sections 28–32px apart.

## Status → visual mapping

| Domain status | Deployment status | Pill |
| --- | --- | --- |
| `active` | `live` | Live / Active · HTTPS |
| `pending` | `queued`, `building`, `deploying` | Building mm:ss / Waiting for DNS |
| `misconfigured` | `failed` | Failed / Needs attention |
| — | `superseded` | Ready (rollback target) |
