# 03 — Web UI

## Stack
React 19 + Vite + TS · Tailwind v4 + shadcn/ui · TanStack Query (server data) + Zustand (UI state) · React Router · React Flow + dagre (graph) · Monaco (+ `monaco-yaml`) · xterm.js · react-hook-form + zod · i18next · lucide icons. Heavy parts (Monaco, graph, xterm) lazy-loaded by route.

## State (simple, better than MVVM)
- **Server data → TanStack Query.** Realtime WS messages just invalidate the right query keys.
- **UI state → small Zustand stores per feature**, with state as plain data and actions as pure functions (testable without React). No logic in components; no `useEffect` for fetching.
- Talk to the API through one typed `ApiClient` (interface) with a real and a fake implementation.
- **Editors** (network/compose/dockerfile) use the command pattern with undo/redo:

```ts
export interface EditorCommand<D> { type: string; apply(doc: D): D }
// history = { past: D[]; present: D; future: D[] }, max 500, coalesce typing within 500 ms
```

## Layout
Sidebar (Dashboard · Containers · Images · Volumes · Networks · Compose · Dockerfile · Builds · Registries · Swarm · Terminal · System · Settings), top bar (command palette `Ctrl/⌘+K`, engine status, theme and language switchers, user menu), operations drawer, toasts. "Show command" on every action.

## Theme (dark / light / system)
CSS variables on `:root[data-theme]`, applied before first paint; `system` follows `prefers-color-scheme`. Test: both themes define the same variables and text/background pairs meet WCAG AA.

| Token | Dark | Light |
|---|---|---|
| `--nx-bg-0` | `#07090B` | `#F4F7F9` |
| `--nx-bg-1` | `#0D1114` | `#FFFFFF` |
| `--nx-bg-2` | `#141A1F` | `#EAF0F3` |
| `--nx-line` | `#1F2A31` | `#D5DFE5` |
| `--nx-text` | `#E6EEF2` | `#0E1A21` |
| `--nx-text-dim` | `#8A9BA6` | `#55677A` |
| `--nx-lime` (fill) | `#B6FF3B` | `#B6FF3B` |
| `--nx-lime-strong` (text/lines) | `#B6FF3B` | `#4C8A00` |
| `--nx-cyan` | `#38D5FF` | `#0089B8` |
| `--nx-violet` (volumes) | `#A78BFA` | `#7C5CE0` |
| `--nx-amber` (config/secret/warn) | `#FFB020` | `#B86E00` |
| `--nx-danger` | `#FF4D6A` | `#D6204A` |

Fonts: Inter + JetBrains Mono, self-hosted. Radius 12 / 8. Futuristic accents: lime/cyan, subtle glow on selected nodes only (off under reduced motion).

**Canvas (n8n-style):** grid background (24 px minor, 120 px major, snap 12), nodes 220×72 with a 40×40 tinted icon (service lime, network cyan, volume violet, config/secret amber), status dot **plus** icon/tooltip, Bézier edges colored by relation, minimap and zoom controls. Perf: visible-only rendering, memoized nodes, layout in a worker above 150 nodes.

## i18n (en, es)
Resources `en.json` / `es.json` per feature, ICU messages, runtime switch without reload, default = browser language. Server errors send `code` + `hintKey`; the web translates. Tests: key parity, placeholder parity, no literal text in JSX.

## Accessibility
Keyboard-operable (including graph: arrows select, Enter inspects, Delete removes with confirm, Ctrl+Z/Y), visible focus, ARIA names from i18n, axe check on main screens in both themes.
