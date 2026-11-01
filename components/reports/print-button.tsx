"use client";

import { Printer } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

/** Print styles strip the chrome, so Ctrl+P produces a clean hand-off sheet. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={buttonClass("secondary", "md")}
    >
      <Printer size={15} />
      Print
    </button>
  );
}
