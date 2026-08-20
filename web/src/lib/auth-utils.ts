export type DbUserRole = "ADMIN" | "ANALYST" | "L1_APPROVER" | "L2_APPROVER";

export function getRoleRedirect(role: DbUserRole | string): string {
  switch (role) {
    case "ANALYST":
    case "analyst":
      return "/applications";
    case "L1_APPROVER":
    case "l1-approver":
      return "/exceptions?level=l1";
    case "L2_APPROVER":
    case "l2-approver":
      return "/exceptions?level=l2";
    case "ADMIN":
    case "admin":
      return "/admin/users";
    default:
      return "/";
  }
}
