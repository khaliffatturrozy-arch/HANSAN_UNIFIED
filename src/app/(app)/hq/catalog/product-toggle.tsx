"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, errorMessage } from "@/lib/client-api";

export function ProductToggle({
  productId,
  active,
  name,
}: {
  productId: string;
  active: boolean;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/hq/catalog/${productId}`, {
        method: "PATCH",
        body: { active: !active },
      });
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="h-btn h-btn-sm"
        aria-label={`${active ? "Deactivate" : "Activate"} ${name}`}
      >
        {busy ? "Saving…" : active ? "Deactivate" : "Activate"}
      </button>
      {error ? <p className="mt-1 max-w-40 text-[10px] font-bold text-brand-red">{error}</p> : null}
    </div>
  );
}
