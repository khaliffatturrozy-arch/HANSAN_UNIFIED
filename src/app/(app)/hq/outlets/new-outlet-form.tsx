"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, WarningCircle } from "@phosphor-icons/react";
import { apiRequest, errorMessage } from "@/lib/client-api";

export function NewOutletForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [tax, setTax] = useState("11");
  const [service, setService] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/api/hq/outlets", {
        method: "POST",
        body: {
          name,
          code,
          taxBps: Math.round(Number(tax) * 100),
          serviceChargeBps: Math.round(Number(service) * 100),
        },
      });
      setSuccess(`${name} created. It is available to tenant administrators.`);
      setName("");
      setCode("");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="h-card h-card-pad grid gap-3" noValidate>
      <div>
        <p className="h-label">New outlet</p>
        <h2 className="mt-0.5 text-lg font-extrabold">Add a service location.</h2>
      </div>

      <div className="h-field">
        <label htmlFor="outlet-name" className="text-[12px] font-extrabold">Outlet name</label>
        <input
          id="outlet-name"
          className="h-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="HANSAN — Kemang"
          required
          minLength={2}
          maxLength={100}
          disabled={busy}
        />
      </div>

      <div className="h-field">
        <label htmlFor="outlet-code" className="text-[12px] font-extrabold">Short code</label>
        <input
          id="outlet-code"
          className="h-input h-mono uppercase"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="KMG"
          required
          minLength={2}
          maxLength={12}
          pattern="[A-Z0-9-]{2,12}"
          disabled={busy}
        />
        <p className="h-hint">Used as the order-number prefix. 2–12 letters, digits, or hyphens.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="h-field">
          <label htmlFor="outlet-tax" className="text-[12px] font-extrabold">Tax %</label>
          <input
            id="outlet-tax"
            className="h-input h-mono"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={tax}
            onChange={(event) => setTax(event.target.value)}
            disabled={busy}
          />
        </div>
        <div className="h-field">
          <label htmlFor="outlet-service" className="text-[12px] font-extrabold">Service %</label>
          <input
            id="outlet-service"
            className="h-input h-mono"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={service}
            onChange={(event) => setService(event.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      {error ? (
        <div className="h-error" role="alert">
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? <p className="h-success" role="status">{success}</p> : null}

      <button type="submit" className="h-btn h-btn-primary mt-1" disabled={busy}>
        <Plus size={17} weight="bold" aria-hidden="true" />
        {busy ? "Creating…" : "Create outlet"}
      </button>
    </form>
  );
}
