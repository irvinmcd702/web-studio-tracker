"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";

import { categoryLabels } from "@/lib/labels";

export type StatusNodeData = {
  name: string;
  color: string;
  category: string;
  isInitial: boolean;
  ticketCount: number;
};

/**
 * A status on the diagram. Both sides carry a source and a target handle, so an
 * arrow can be drawn in whichever direction the layout makes convenient.
 */
export function StatusNode({ data, selected }: NodeProps) {
  const node = data as unknown as StatusNodeData;

  return (
    <div
      className={`w-[196px] rounded-xl border-2 bg-[var(--color-surface)] px-3 py-2.5 shadow-sm transition ${
        selected
          ? "border-[var(--color-brand)] shadow-md"
          : "border-transparent"
      }`}
      style={{ borderLeftColor: node.color, borderLeftWidth: 5 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--color-surface)] !bg-[var(--color-faint)]"
      />

      <div className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: node.color }}
        />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {node.name}
        </span>
        {node.isInitial ? (
          <Flag size={13} className="shrink-0 text-[var(--color-brand)]" />
        ) : null}
      </div>

      <p className="mt-0.5 text-[11.5px] text-[var(--color-muted)]">
        {categoryLabels[node.category]} · {node.ticketCount} tickets
      </p>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--color-surface)] !bg-[var(--color-brand)]"
      />
    </div>
  );
}

/** Origin for"from any status" arrows, which have no real node to start at. */
export function AnyStatusNode({ selected }: NodeProps) {
  return (
    <div
      className={`w-[196px] rounded-xl border-2 border-dashed bg-[var(--color-surface-2)] px-3 py-2.5 text-center ${
        selected
          ? "border-[var(--color-brand)]"
          : "border-[var(--color-line-strong)]"
      }`}
    >
      <p className="text-[13px] font-semibold text-[var(--color-ink-2)]">
        Any status
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
        Arrows from here apply everywhere
      </p>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--color-surface)] !bg-[var(--color-muted)]"
      />
    </div>
  );
}
