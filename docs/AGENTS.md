# AGENTS.md — Build Instructions for [PROJECT_NAME]

Read `PRD.md`, `context.md`, `design-system.md`, and
`login-signup-concept.md` before writing any code. This file is the
execution instructions; those files are the spec and rationale.

## Phase Scope — Read This First

**This phase is frontend-only.** Do not scaffold a real database, do not
wire real auth, do not send real emails. Everything runs on static
TypeScript mock data and in-memory React state, on top of the existing
Next.js (App Router) skeleton already in this repo. Treat all backend
entities in `PRD.md` §8 as a shape to match in mock data, not something to
implement yet.

## One-time setup steps

Run these once at the start of the session, not on every turn:

1. **Design skill.** Fetch and read
   `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` and apply its
   guidance alongside `design-system.md` in this folder. Where the two
   conflict, `design-system.md` wins — it's the resolved, project-specific
   direction; treat the external repo as general supplementary technique,
   not an override.

2. **21st.dev MCP connector.** Connect the 21st.dev MCP server. The
   provided token is a live credential — **do not hardcode it in any
   source file or commit it**. Store it in `.env.local` (already
   gitignored) as `TWENTYFIRST_API_KEY` or the variable name that
   connector's setup docs specify, and load it from environment at
   connection time. If the token was pasted in plaintext anywhere earlier
   in this project's history, flag it for rotation before shipping — treat
   an exposed token as compromised.

3. Confirm both are available before starting component work; if either
   fails to connect, note it and proceed with the rest of the build rather
   than blocking on it — the design tokens in `design-system.md` are
   sufficient on their own to avoid the generic-AI-look failure mode even
   without the external skill/connector.

## Token-efficiency instructions

- Don't re-read the design/context docs in full on every file you touch —
  read them once at session start, then work from a short internal summary
  for subsequent files.
- Prefer editing existing files over regenerating whole components from
  scratch when making small changes.
- Batch related component work (e.g., build all four role dashboards in
  one pass using the shared card/table primitives) rather than
  round-tripping per screen.
- Avoid unnecessary exploratory shell commands once the project structure
  is understood — cache that understanding instead of re-listing
  directories repeatedly.
- Keep generated mock data compact — five demo applicants (per PRD §7),
  not fifty.

## Build order

1. Design tokens: implement the palette, type scale, and spacing from
   `design-system.md` as CSS variables / Tailwind theme config first,
   before building screens — every component should consume tokens, not
   hardcoded values.
2. Shared primitives: the "index card," the folder-tab sidebar, the stamp
   signature element, status badges (Approved/Hard Reject/Exception
   colors) — build these once, reuse everywhere.
3. Auth screens per `login-signup-concept.md` (Sign In + Activate Account
   states, folder-tab switch interaction).
4. Role-specific dashboards, in this order: Analyst → L1/L2 Approver
   (shared queue component, filtered by level) → Admin (users + rule
   config + audit log).
5. Wire the five required demo scenarios (PRD §7) into mock data and
   verify each one is reachable and produces the correct decision state,
   including the live-reconfiguration scenario (#5).

## Constraints carried from design-system.md (do not violate)

- No cream+terracotta, no near-black+neon-accent, no numbered `01/02/03`
  decorative markers unless content is a genuine sequence.
- Status colors (`--approve` / `--reject` / `--exception`) reserved for
  decision states only — never reused for unrelated UI.
- The stamp element appears once per evaluation view and once on account
  activation — nowhere else. Don't scatter it as decoration.
- Respect `prefers-reduced-motion` on every animated element (stamp
  entrance, folder-tab slide).

## Definition of done for this phase

- All 4 role dashboards functional against mock data.
- Admin can create a mock user, edit a mock rule, and see both actions
  reflected in a mock audit log view.
- All 5 required demo scenarios (PRD §7) are reachable and correct,
  including the live threshold-change scenario.
- Auth flow (Sign In / Activate Account) matches
  `login-signup-concept.md`.
- No unauthorized route is reachable by the wrong role — even in this
  mock/frontend phase, gate by role in a central place (e.g., a route
  guard component) so the same logic can move server-side later without a
  rewrite.
