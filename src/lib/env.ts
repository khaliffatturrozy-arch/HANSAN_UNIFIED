export function isDemoMode(): boolean {
  // Demo data is opt-in only. It never defaults on, including in development.
  return process.env.HANSAN_DEMO_MODE === "true";
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
