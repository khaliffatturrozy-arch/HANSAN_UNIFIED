"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react";
import { apiRequest, errorMessage } from "@/lib/client-api";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: {} });
      router.push("/login");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="h-btn h-btn-sm h-btn-ghost w-full justify-start"
        aria-label="Sign out"
      >
        <SignOut size={18} aria-hidden="true" />
        {busy ? "Signing out…" : compact ? "Sign out" : "Sign out of this shift"}
      </button>
      {error ? (
        <p className="mt-1 text-xs font-bold text-brand-red" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
