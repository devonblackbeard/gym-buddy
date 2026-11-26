import { createContext, useContext, useState } from "react";
import type { User } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import { toast } from "../lib/toast";
import { UserCircle } from "./Icons";
import { Sheet } from "./Sheet";

export interface AccountState {
  user: User;
  /** Forget the user locally after the server session is gone. */
  onSignedOut: () => void;
}

export const AccountContext = createContext<AccountState | null>(null);

/** Top-bar button that opens the account sheet (who's signed in, sign out). */
export function AccountButton() {
  const account = useContext(AccountContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!account) return null;

  const signOut = async () => {
    setBusy(true);
    try {
      await api.signOut();
      account.onSignedOut();
    } catch (e) {
      toast(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <button className="icon-btn topbar-end" onClick={() => setOpen(true)} aria-label="Account">
        <UserCircle />
      </button>
      {open && (
        <Sheet title="Account" onClose={() => setOpen(false)}>
          <div className="name-form">
            <div className="field">
              <span className="field-label">Signed in as</span>
              <span className="account-email">{account.user.email}</span>
            </div>
            <button className="btn btn-secondary btn-wide" onClick={signOut} disabled={busy}>
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
