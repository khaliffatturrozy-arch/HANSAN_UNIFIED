"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, WarningCircle } from "@phosphor-icons/react";
import { apiRequest, errorMessage } from "@/lib/client-api";

export function NewProductForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [price, setPrice] = useState("25000");
  const [station, setStation] = useState<"kitchen" | "bar">("kitchen");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !categoryId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/api/hq/catalog", {
        method: "POST",
        body: {
          name,
          sku,
          categoryId,
          priceMinor: Number(price),
          station,
          description,
        },
      });
      setSuccess(`${name} added to the catalog and all active outlets.`);
      setName("");
      setSku("");
      setDescription("");
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
        <p className="h-label">New product</p>
        <h2 className="mt-0.5 text-lg font-extrabold">Add to the menu.</h2>
      </div>

      <div className="h-field">
        <label htmlFor="product-name" className="text-[12px] font-extrabold">Name</label>
        <input
          id="product-name"
          className="h-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nasi Goreng Kampung"
          required
          minLength={2}
          maxLength={120}
          disabled={busy}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="h-field">
          <label htmlFor="product-sku" className="text-[12px] font-extrabold">SKU</label>
          <input
            id="product-sku"
            className="h-input h-mono uppercase"
            value={sku}
            onChange={(event) => setSku(event.target.value.toUpperCase())}
            placeholder="NAS-02"
            required
            minLength={2}
            maxLength={24}
            pattern="[A-Z0-9-]{2,24}"
            disabled={busy}
          />
        </div>
        <div className="h-field">
          <label htmlFor="product-price" className="text-[12px] font-extrabold">Price (IDR)</label>
          <input
            id="product-price"
            className="h-input h-mono"
            type="number"
            min={0}
            max={1000000000}
            step={1}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
            disabled={busy}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="h-field">
          <label htmlFor="product-category" className="text-[12px] font-extrabold">Category</label>
          <select
            id="product-category"
            className="h-select"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={busy || categories.length === 0}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>
        <div className="h-field">
          <label htmlFor="product-station" className="text-[12px] font-extrabold">Station</label>
          <select
            id="product-station"
            className="h-select"
            value={station}
            onChange={(event) => setStation(event.target.value === "bar" ? "bar" : "kitchen")}
            disabled={busy}
          >
            <option value="kitchen">Kitchen</option>
            <option value="bar">Bar</option>
          </select>
        </div>
      </div>

      <div className="h-field">
        <label htmlFor="product-description" className="text-[12px] font-extrabold">
          Description <span className="font-semibold text-muted">(optional)</span>
        </label>
        <input
          id="product-description"
          className="h-input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
          placeholder="Short menu description"
          disabled={busy}
        />
      </div>

      {error ? (
        <div className="h-error" role="alert">
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? <p className="h-success" role="status">{success}</p> : null}

      <button type="submit" className="h-btn h-btn-primary mt-1" disabled={busy || categories.length === 0}>
        <Plus size={17} weight="bold" aria-hidden="true" />
        {busy ? "Adding…" : "Add product"}
      </button>
    </form>
  );
}
