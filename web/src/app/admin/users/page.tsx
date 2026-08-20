"use client";

/**
 * Admin — Users /admin/users
 *
 * Manages the user roster. Admin can:
 *   - See all existing users with role + status
 *   - Create a new user (email + role) — generates a mock activation link
 *     and shows it in the UI (in production this would be emailed)
 *   - All creates are appended to the audit log
 */

import { useState, useCallback, useEffect } from "react";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { DashboardShell } from "@/components/dashboard/shell";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { createUserAction } from "@/app/actions/admin";
import type { DbUserRole } from "@/lib/auth-utils";

export default function AdminUsersPage() {
  return (
    <DashboardShell>
      <RoleGuard allowedRoles={["admin"]}>
        <UsersContent />
      </RoleGuard>
    </DashboardShell>
  );
}

const ROLE_LABELS: Record<string, string> = {
  ANALYST: "Analyst",
  L1_APPROVER: "L1 Approver",
  L2_APPROVER: "L2 / Credit Head",
  ADMIN: "Admin",
};

interface DbUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

function UsersContent() {
  const supabase = createClient();
  const [users, setUsers] = useState<DbUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("analyst");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdUser, setCreatedUser] = useState<DbUser | null>(null);
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, email, name, role, status")
      .order("created_at", { ascending: false });

    if (data && !error) {
      setUsers(data);
    }
    setLoadingUsers(false);
  }, [supabase]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = useCallback(async () => {
    setEmailError("");
    setFormError("");

    if (!email.trim() || !email.includes("@")) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (!name.trim()) return;

    setIsSubmitting(true);
    
    const res = await createUserAction(email.trim(), name.trim(), role);
    
    if (res.error) {
      setFormError(res.error);
      setIsSubmitting(false);
      return;
    }

    // Success
    setCreatedUser({
      id: "pending",
      email: email.trim(),
      name: name.trim(),
      role: role.toUpperCase().replace("-", "_"),
      status: "PENDING_SETUP"
    });
    
    setEmail("");
    setName("");
    setRole("analyst");
    setShowForm(false);
    setIsSubmitting(false);
    
    // Refresh list
    loadUsers();
  }, [email, name, role, loadUsers]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Admin · User management</p>
          <h1 className="text-2xl mt-1">Users</h1>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setCreatedUser(null); }}
          className="bg-[var(--brass)] text-[var(--paper)] border border-[var(--brass)] rounded-[var(--radius-sm)] px-4 py-2 text-xs font-mono uppercase tracking-wider hover:bg-[color-mix(in_oklch,var(--brass),var(--ink)_18%)] transition-colors"
        >
          {showForm ? "Cancel" : "+ New User"}
        </button>
      </div>

      {/* Success Notice */}
      {createdUser && !showForm && (
        <IndexCard tabTone="approve" as="div">
          <p className="font-mono text-xs text-[var(--approve)] uppercase tracking-wider mb-2">
            User created · Activation email sent
          </p>
          <p className="text-sm text-[var(--ink)] mb-1">
            Account created for <strong>{createdUser.email}</strong> ({ROLE_LABELS[createdUser.role]}).
          </p>
          <p className="text-xs text-[var(--ink-muted)]">
            An activation link valid for 48 hours has been emailed to the user.
          </p>
        </IndexCard>
      )}

      {/* Create user form */}
      {showForm && (
        <IndexCard tabTone="brass" as="div">
          <IndexCardHeader title="Create New User" meta="Admin-provisioned accounts only" />
          <div className="space-y-4 mt-4">
            {formError && (
              <div className="bg-[color-mix(in_oklch,var(--reject),transparent_90%)] text-[var(--reject)] p-3 text-sm rounded-[var(--radius-sm)]">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Full name" error="">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Mehta"
                  className="w-full bg-[var(--paper)] border border-[color-mix(in_oklch,var(--ink),transparent_75%)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brass)]"
                />
              </FormField>
              <FormField label="Email" error={emailError}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rahul@orizon.in"
                  className={cn(
                    "w-full bg-[var(--paper)] border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1",
                    emailError
                      ? "border-[var(--reject)] focus:ring-[var(--reject)]"
                      : "border-[color-mix(in_oklch,var(--ink),transparent_75%)] focus:ring-[var(--brass)]",
                  )}
                />
              </FormField>
            </div>
            <FormField label="Role" error="">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-[var(--paper)] border border-[color-mix(in_oklch,var(--ink),transparent_75%)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brass)]"
              >
                <option value="analyst">Analyst</option>
                <option value="l1-approver">L1 Approver</option>
                <option value="l2-approver">L2 / Credit Head</option>
                <option value="admin">Admin</option>
              </select>
            </FormField>
            <button
              onClick={handleCreate}
              disabled={isSubmitting}
              className="bg-[var(--brass)] text-[var(--paper)] border border-[var(--brass)] rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-medium hover:bg-[color-mix(in_oklch,var(--brass),var(--ink)_18%)] transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create account & send activation link"}
            </button>
          </div>
        </IndexCard>
      )}

      {/* Users table */}
      <IndexCard tabTone="default" as="div">
        <IndexCardHeader title="All Users" meta={loadingUsers ? "Loading..." : `${users.length} accounts`} />
        <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
            {["Name", "Email", "Role", "Status"].map((h) => (
              <span key={h} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">{h}</span>
            ))}
          </div>
          {users.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 items-center px-6 py-3 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0"
            >
              <span className="text-sm text-[var(--ink)]">{u.name}</span>
              <span className="font-mono text-xs text-[var(--ink-muted)] truncate">{u.email}</span>
              <span className="font-mono text-xs text-[var(--ink)] whitespace-nowrap">
                {ROLE_LABELS[u.role] ?? u.role}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded-[2px] whitespace-nowrap",
                  u.status === "ACTIVE"
                    ? "border-[var(--approve)] text-[var(--approve)]"
                    : "border-[var(--exception)] text-[var(--exception)]",
                )}
              >
                {u.status === "ACTIVE" ? "Active" : "Pending"}
              </span>
            </div>
          ))}
        </div>
      </IndexCard>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
        {label}
      </label>
      {children}
      {error && (
        <p className="font-mono text-xs text-[var(--reject)]">{error}</p>
      )}
    </div>
  );
}
