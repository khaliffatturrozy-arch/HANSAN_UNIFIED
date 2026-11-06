"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeSlash, LockKey, WarningCircle } from "@phosphor-icons/react";
import { apiRequest, errorMessage } from "@/lib/client-api";

interface LoginResponse {
  redirectTo: string;
  actor: { displayName: string; role: string };
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      router.push(data.redirectTo);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="h-field">
          <label htmlFor="email" className="text-[12px] font-extrabold">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-input"
            placeholder="you@restaurant.id"
            disabled={busy}
          />
        </div>

        <div className="h-field">
          <label htmlFor="password" className="text-[12px] font-extrabold">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              required
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-input pr-12"
              placeholder="At least 10 characters"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {error ? (
          <div className="h-error" role="alert">
            <WarningCircle size={18} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className="h-btn h-btn-primary mt-1 w-full" disabled={busy}>
          <LockKey size={18} weight="bold" aria-hidden="true" />
          {busy ? "Checking credentials…" : "Sign in"}
        </button>
      </form>

    </div>
  );
}
