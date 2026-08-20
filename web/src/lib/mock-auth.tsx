"use client";

/**
 * mock-auth.tsx — React context for mock authentication state.
 *
 * Provides:
 *   - AuthProvider   : wrap the root layout with this
 *   - useMockAuth    : hook to read/mutate auth state in client components
 *
 * State is persisted to sessionStorage so a hot-reload or page refresh
 * doesn't sign the demo user out mid-session. Cleared on explicit logout.
 *
 * No real tokens, no HTTP requests — this is the frontend-only mock phase.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  validateCredentials,
  getRoleRedirect,
  type MockUser,
} from "@/lib/mock-users";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthState {
  currentUser: MockUser | null;
  isAuthenticated: boolean;
}

export interface AuthActions {
  /** Returns the authenticated user on success, or an error string on failure. */
  login: (email: string, password: string) => Promise<{ user: MockUser } | { error: string }>;
  /** Marks a pending activation as complete, returning the activated user. */
  activate: (email: string) => Promise<MockUser>;
  logout: () => void;
  /** Derives the landing route for the current user's role. */
  roleRedirect: () => string;
}

export type AuthContext = AuthState & AuthActions;

// ─── Context ──────────────────────────────────────────────────────────────────

const Ctx = createContext<AuthContext | null>(null);

const SESSION_KEY = "orizon_mock_user";

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<MockUser | null>(null);

  // Rehydrate from sessionStorage on mount (handles dev hot-reload)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) setCurrentUser(JSON.parse(raw) as MockUser);
    } catch {
      // Corrupt session — ignore and stay logged out
    }
  }, []);

  const persistUser = useCallback((user: MockUser | null) => {
    setCurrentUser(user);
    if (user) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ user: MockUser } | { error: string }> => {
      // Simulate a tiny async round-trip so the UI can show a loading state
      await new Promise((r) => setTimeout(r, 400));
      const user = validateCredentials(email, password);
      if (!user) {
        // Deliberately vague — don't leak whether email or password was wrong
        return { error: "That email and password don't match. Try again." };
      }
      persistUser(user);
      return { user };
    },
    [persistUser],
  );

  const activate = useCallback(
    async (email: string): Promise<MockUser> => {
      await new Promise((r) => setTimeout(r, 400));
      // After activation, the user becomes an analyst (default new-user role)
      const user: MockUser = { email, name: "New User", role: "analyst" };
      // Don't auto-login here — activation redirects to /login for explicit sign-in
      return user;
    },
    [],
  );

  const logout = useCallback(() => {
    persistUser(null);
  }, [persistUser]);

  const roleRedirect = useCallback(() => {
    return currentUser ? getRoleRedirect(currentUser.role) : "/";
  }, [currentUser]);

  return (
    <Ctx.Provider
      value={{
        currentUser,
        isAuthenticated: currentUser !== null,
        login,
        activate,
        logout,
        roleRedirect,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMockAuth(): AuthContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useMockAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
