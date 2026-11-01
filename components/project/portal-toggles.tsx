"use client";

import { useState } from "react";

import { PORTAL_TOGGLES, type PortalToggleValues } from "@/lib/portal";

/**
 * The portal switches as form fields. Shared by the project settings card
 * and the create-project form, so both always offer the same list.
 */
export function PortalToggles({
  values,
  compact = false,
}: {
  values: PortalToggleValues;
  compact?: boolean;
}) {
  const [current, setCurrent] = useState(values);

  // Two switches only mean something inside another one: uploading needs the
  // files section, and a plan of stages needs the stages.
  const isDisabled = (name: string) =>
    (name === "portalAllowUploads" && !current.portalShowFiles) ||
    (name === "portalShowStagePlan" && !current.portalShowApprovals);

  return (
    <div className={compact ? "grid gap-1 sm:grid-cols-2" : "space-y-1"}>
      {PORTAL_TOGGLES.map((toggle) => {
        const disabled = isDisabled(toggle.name);
        return (
          <label
            key={toggle.name}
            className={`flex items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-[var(--color-hover)] ${
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              name={toggle.name}
              checked={current[toggle.name] && !disabled}
              disabled={disabled}
              onChange={(e) =>
                setCurrent((c) => ({ ...c, [toggle.name]: e.target.checked }))
              }
              className="mt-0.5 accent-[var(--color-brand)]"
            />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium">
                {toggle.label}
              </span>
              <span className="block text-[12px] text-[var(--color-muted)]">
                {toggle.hint}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
