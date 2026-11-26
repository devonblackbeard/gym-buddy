import { useState } from "react";
import type { User } from "../../shared/types";
import { Dumbbell } from "../components/Icons";
import { api, errorMessage } from "../lib/api";

type Mode = "signin" | "signup";

/** Full-screen sign in / create account. Shown whenever nobody is signed in. */
export function AuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signup = mode === "signup";

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = signup ? await api.signUp(email.trim(), password) : await api.signIn(email.trim(), password);
      onSignedIn(user);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <main className="auth">
      <div className="auth-brand">
        <div className="empty-icon">
          <Dumbbell width={36} height={36} />
        </div>
        <h1 className="title">Gym Buddy</h1>
        <p>{signup ? "Create an account to start logging your workouts." : "Sign in to your workout log."}</p>
      </div>

      <div className="segmented auth-tabs" role="tablist">
        <button role="tab" aria-selected={!signup} className={signup ? "" : "active"} onClick={() => switchMode("signin")}>
          Sign in
        </button>
        <button role="tab" aria-selected={signup} className={signup ? "active" : ""} onClick={() => switchMode("signup")}>
          Create account
        </button>
      </div>

      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="text-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <span className="password-row">
            <input
              className="text-input"
              type={showPassword ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={signup ? 8 : undefined}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="link-btn password-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
          {signup && <span className="field-hint">At least 8 characters.</span>}
        </label>

        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-wide" disabled={busy || !email.trim() || !password}>
          {busy ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
