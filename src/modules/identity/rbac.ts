import { AppError, ERROR_CODES } from "@/modules/shared/errors";

export const ROLES = [
  "owner",
  "org_admin",
  "finance",
  "outlet_manager",
  "cashier",
  "kitchen",
  "bar",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "hq:view",
  "hq:manage_outlets",
  "hq:manage_catalog",
  "hq:view_finance",
  "hq:view_staff",
  "pos:operate",
  "pos:discount",
  "pos:refund",
  "kds:view",
  "kds:operate",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Deny-by-default permission matrix. Owner is the only business superuser.
 * Finance can view operational HQ data but cannot mutate catalog or outlets.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: [
    "hq:view",
    "hq:manage_outlets",
    "hq:manage_catalog",
    "hq:view_finance",
    "hq:view_staff",
    "pos:operate",
    "pos:discount",
    "pos:refund",
    "kds:view",
    "kds:operate",
  ],
  org_admin: [
    "hq:view",
    "hq:manage_outlets",
    "hq:manage_catalog",
    "hq:view_staff",
    "pos:operate",
    "kds:view",
  ],
  finance: ["hq:view", "hq:view_finance"],
  outlet_manager: [
    "hq:view",
    "hq:manage_catalog",
    "hq:view_staff",
    "pos:operate",
    "pos:discount",
    "kds:view",
    "kds:operate",
  ],
  cashier: ["pos:operate"],
  kitchen: ["kds:view", "kds:operate"],
  bar: ["kds:view", "kds:operate"],
};

export interface Actor {
  userId: string;
  membershipId: string;
  tenantId: string;
  tenantName: string;
  outletId: string;
  outletName: string;
  role: Role;
  displayName: string;
  email: string;
  /** Outlets this actor may enter. Admin roles implicitly cover the tenant. */
  grantedOutletIds: string[];
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function actorCan(actor: Actor, permission: Permission): boolean {
  return can(actor.role, permission);
}

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!actorCan(actor, permission)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, `Role "${actor.role}" lacks permission "${permission}"`);
  }
}

export function isTenantAdmin(role: Role): boolean {
  return role === "owner" || role === "org_admin";
}

/** Outlet access is explicit for operational roles and tenant-wide for admins. */
export function canAccessOutlet(actor: Actor, outletId: string): boolean {
  return isTenantAdmin(actor.role) || actor.grantedOutletIds.includes(outletId);
}

export function assertOutletAccess(actor: Actor, outletId: string): void {
  if (!canAccessOutlet(actor, outletId)) {
    // Report as not-found to avoid disclosing another outlet's existence.
    throw new AppError(ERROR_CODES.NOT_FOUND, "Outlet not found");
  }
}

export function assertStationAccess(actor: Actor, station: "kitchen" | "bar"): void {
  if (actor.role === "kitchen" && station !== "kitchen") {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Kitchen staff cannot operate the bar station");
  }
  if (actor.role === "bar" && station !== "bar") {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Bar staff cannot operate the kitchen station");
  }
}

export function homeForRole(role: Role): string {
  if (role === "cashier" || role === "outlet_manager") return "/pos";
  if (role === "kitchen" || role === "bar") return "/kds";
  return "/hq";
}
