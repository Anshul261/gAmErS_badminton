"use client";

import { createContext, useCallback, useContext, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = { title: string; body?: string; action: string; danger?: boolean };
type Pending = { options: ConfirmOptions; resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/** An in-app "are you sure" dialog in place of the browser popup. Resolves true on the action button, false on anything else. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // The last request stays on screen while the dialog fades out.
  const [shown, setShown] = useState<ConfirmOptions | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setShown(options);
    setPending((current) => {
      current?.resolve(false);
      return { options, resolve };
    });
  }), []);
  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        <AlertDialogContent className="cs-dialog cs-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{shown?.title}</AlertDialogTitle>
            {shown?.body ? <AlertDialogDescription>{shown.body}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cs-button cs-button-outline">Cancel</AlertDialogCancel>
            <AlertDialogAction className={`cs-button ${shown?.danger ? "cs-button-danger" : "cs-button-primary"}`} onClick={() => settle(true)}>{shown?.action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider.");
  return confirm;
}
