/**
 * mock-users.ts — Static mock user table for the frontend-only phase.
 *
 * Source of truth: PRD.md §7 (five demo applicants), §8 (entity shapes).
 * No real auth, no real DB. All passwords are "demo" — documented here,
 * never hardcoded in a shipped secret store.
 *
 * Do not import this file in components — use mock-auth.tsx instead.
 */

export type UserRole = "analyst" | "l1-approver" | "l2-approver" | "admin";

export interface MockUser {
  email: string;
  name: string;
  role: UserRole;
}

/** Internal only — credentials never leave this module. */
interface MockCredential extends MockUser {
  _password: string;
}

const MOCK_CREDENTIALS: MockCredential[] = [
  {
    email: "analyst@orizon.in",
    _password: "demo",
    role: "analyst",
    name: "Priya Shankar",
  },
  {
    email: "l1@orizon.in",
    _password: "demo",
    role: "l1-approver",
    name: "Ravi Kulkarni",
  },
  {
    email: "l2@orizon.in",
    _password: "demo",
    role: "l2-approver",
    name: "Sunita Menon",
  },
  {
    email: "admin@orizon.in",
    _password: "demo",
    role: "admin",
    name: "Arjun Verma",
  },
];

/**
 * A pending user who arrives via a tokenized activation link.
 * Any non-empty `?token=` value in the URL is treated as valid (mock phase).
 */
export const MOCK_PENDING_USER: MockUser = {
  email: "newuser@orizon.in",
  name: "New User",
  role: "analyst", // Default role assigned by admin at account creation
};

/**
 * Validate credentials and return the user if they match.
 * Returns null on any mismatch — deliberately no distinction between
 * "email not found" and "wrong password" (per PRD §9 security guidance).
 */
export function validateCredentials(
  email: string,
  password: string,
): MockUser | null {
  const match = MOCK_CREDENTIALS.find(
    (c) =>
      c.email.toLowerCase() === email.toLowerCase() && c._password === password,
  );
  if (!match) return null;
  // Strip the internal password field before returning
  const { _password: _, ...user } = match;
  return user;
}

/**
 * Role → landing route mapping (login-signup-concept.md §Role-based redirect).
 */
export function getRoleRedirect(role: UserRole): string {
  switch (role) {
    case "analyst":
      return "/applications";
    case "l1-approver":
      return "/exceptions?level=l1";
    case "l2-approver":
      return "/exceptions?level=l2";
    case "admin":
      return "/admin/users";
  }
}
