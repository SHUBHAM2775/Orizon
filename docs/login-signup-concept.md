# Login / Account-Activation Concept

## Important framing note

Because account provisioning follows **Option A** (see context.md §4 —
Admin creates every account, no public self-registration), there is no
traditional "Sign Up" screen in this product. The two real entry states
a user hits are:

1. **Log in** — existing, active account with a password already set.
2. **Activate account** — a brand-new user who received an emailed
   setup link and needs to set their own password for the first time.

The design brief asked for something more distinctive than a plain
stacked form, and specifically floated a "sidebar-switching" pattern.
Given the case-file visual language already established in
`design-system.md`, the resolved concept below reuses that same metaphor
rather than inventing an unrelated interaction — this keeps the product
visually coherent instead of treating the login page as a separate
"marketing" moment.

## Resolved concept: "The Folder Tabs"

The screen is split into two zones:

- **Left: a narrow vertical rail of two physical-looking folder tabs**,
  stacked like tabs on a hanging file folder — one labeled `SIGN IN`, one
  labeled `ACTIVATE`. Only one is reachable at a time in practice (a
  fresh user arrives via a tokenized link straight into `ACTIVATE`; a
  returning user lands on `SIGN IN` by default) — but both are visually
  present, so the metaphor reads correctly even though most users never
  manually switch.
- **Right: the active "case file" card** — the actual form — rendered
  using the same index-card treatment as dashboard cards (hairline
  border, tab-edge detail at the top, `--paper` background).

Clicking the inactive tab **slides the case-file card** across
(200–250ms ease, respecting `prefers-reduced-motion` → instant swap
instead), while the tab rail itself doesn't move — only the active card
does, similar to pulling a different file forward in a drawer. This is
the "niche, not just a theme toggle" interaction: it's a physical
drawer/folder motion, not a generic tab-underline switch.

```
┌────────┬──────────────────────────────┐
│  [TAB]  │                             │
│ SIGN IN │   ┌───────────────────┐     │
│ (active)│   │  Sign in           │    │
│         │   │  Email    [_____]  │    │
│  [TAB]  │   │  Password [_____]  │    │
│ACTIVATE │   │                     │    │
│         │   │  [ Sign in ]        │    │
│         │   └───────────────────┘     │
└────────┴──────────────────────────────┘
```

## Sign In state

- Fields: email, password.
- A visible small line under the form: *"Don't have an account? Accounts
  are created by your Admin — check your email for an activation link."*
  This directly communicates the Option-A model to a confused user
  instead of presenting a dead-end "Sign Up" link that doesn't exist.
- Error states use `--reject` red, in the interface's voice — e.g.,
  "That email and password don't match" rather than a vague generic
  error, per the writing guidance in design-system.md's parent skill.

## Activate Account state

- Reached only via a tokenized URL (`/activate?token=...`) — the tab is
  still visually present for consistency, but should be **disabled with
  a tooltip** ("Activation links are sent by email") if a user reaches it
  without a valid token, rather than showing a broken/empty form.
- Fields: new password, confirm password. Show the user's own email
  (pre-filled, read-only) so they have context on which account they're
  activating.
- On success: the stamp signature element from design-system.md appears
  briefly — an `--approve` colored stamp reading "ACTIVATED" — before
  redirecting to login. This is the one deliberate place outside the
  underwriting flow itself where the stamp motif is reused, and it's
  justified because "account activated" is genuinely a small decision
  event, consistent with the rest of the product's visual language.

## Role-based redirect after login

Once authenticated, route by role (server-side, not just client
redirect — consistent with the RBAC requirement that authorization can't
rely on hiding UI):

| Role | Lands on |
|---|---|
| Analyst | `/applications` |
| L1 Approver | `/exceptions?level=l1` |
| L2 / Credit Head | `/exceptions?level=l2` |
| Admin | `/admin/users` |

## What this deliberately avoids

- A full light/dark theme toggle — not what was asked for, and would
  dilute the single paper-toned palette that gives the product its
  identity.
- A generic split-screen "illustration on one side, form on the other"
  pattern — the most common template for auth screens, and exactly the
  kind of default this project is trying to avoid.
- Multi-step wizard-style signup — irrelevant here since there is no
  self-signup at all.
