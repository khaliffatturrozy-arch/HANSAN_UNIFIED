import type { Role } from "./rbac";

export interface DemoAccount {
  label: string;
  email: string;
  role: Role;
}

export interface DemoCredential extends DemoAccount {
  password: string;
}

/**
 * Demo accounts are metadata only. The password is never committed; it must be
 * supplied through HANSAN_DEMO_PASSWORD in an isolated local/test environment.
 */
export const DEMO_ACCOUNTS = [
  { label: "Owner", email: "owner@demo.hansan.id", role: "owner" },
  { label: "Outlet manager", email: "manager@demo.hansan.id", role: "outlet_manager" },
  { label: "Cashier", email: "cashier@demo.hansan.id", role: "cashier" },
  { label: "Kitchen", email: "kitchen@demo.hansan.id", role: "kitchen" },
  { label: "Bar", email: "bar@demo.hansan.id", role: "bar" },
  { label: "Finance", email: "finance@demo.hansan.id", role: "finance" },
] as const satisfies readonly DemoAccount[];

export function getDemoCredentials(): DemoCredential[] {
  const password = process.env.HANSAN_DEMO_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      "HANSAN_DEMO_PASSWORD must be set to at least 12 characters before demo seeding.",
    );
  }

  return DEMO_ACCOUNTS.map((account) => ({ ...account, password }));
}
