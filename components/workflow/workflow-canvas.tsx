"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { AlertCircle, Loader2 } from "lucide-react";

import "@xyflow/react/dist/style.css";

import { useThemeMode } from "@/components/shell/use-theme-mode";

import {
  connectStatusesAction,
  saveWorkflowLayoutAction,
} from "@/app/actions/workflows";
import { AnyStatusNode, StatusNode } from "@/components/workflow/status-node";
import {
  TransitionPanel,
  type PanelTransition,
} from "@/components/workflow/transition-panel";
import {
  describeConditions,
  describeHooks,
  parseConditions,
  parseHooks,
} from "@/lib/workflow-rules";

export const ANY_STATUS_ID = "__any__";

export type CanvasStatus = {
  id: string;
  name: string;
  color: string;
  category: string;
  isInitial: boolean;
  ticketCount: number;
  canvasX: number;
  canvasY: number;
};

export type CanvasTransition = {
  id: string;
  name: string;
  fromStatusId: string | null;
  toStatusId: string;
  conditions: unknown;
  hooks: unknown;
};

// Defined outside the component: React Flow warns if these identities change.
const nodeTypes = { status: StatusNode, any: AnyStatusNode };

export function WorkflowCanvas({
  workflowId,
  statuses,
  transitions,
  canEdit,
}: {
  workflowId: string;
  statuses: CanvasStatus[];
  transitions: CanvasTransition[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const mode = useThemeMode();

  const initialNodes = useMemo<Node[]>(() => {
    const list: Node[] = statuses.map((s) => ({
      id: s.id,
      type: "status",
      position: { x: s.canvasX, y: s.canvasY },
      data: {
        name: s.name,
        color: s.color,
        category: s.category,
        isInitial: s.isInitial,
        ticketCount: s.ticketCount,
      },
    }));

    // The catch-all origin sits to the left of everything else.
    const hasGlobal = transitions.some((t) => t.fromStatusId === null);
    if (hasGlobal || canEdit) {
      const minX = Math.min(...statuses.map((s) => s.canvasX), 0);
      const maxY = Math.max(...statuses.map((s) => s.canvasY), 0);
      list.push({
        id: ANY_STATUS_ID,
        type: "any",
        position: { x: minX - 40, y: maxY + 190 },
        data: {},
        draggable: false,
      });
    }

    return list;
  }, [statuses, transitions, canEdit]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);

  // Server data wins whenever the route revalidates.
  const [syncedNodes, setSyncedNodes] = useState(initialNodes);
  if (syncedNodes !== initialNodes) {
    setSyncedNodes(initialNodes);
    setNodes(initialNodes);
  }

  const statusName = useCallback(
    (id: string | null) =>
      id === null
        ? "Any status"
        : (statuses.find((s) => s.id === id)?.name ?? "?"),
    [statuses],
  );

  const edges = useMemo<Edge[]>(
    () =>
      transitions.map((t) => {
        const conditions = parseConditions(t.conditions);
        const hooks = parseHooks(t.hooks);
        const conditionChips = describeConditions(conditions);
        const hookChips = describeHooks(hooks);

        // Colour carries meaning: amber is gated, violet automated.
        const gated = conditionChips.length > 0;
        const automated = hookChips.length > 0;
        const stroke = gated ? "#d97706" : automated ? "#7c3aed" : "#94a3b8";

        const label = [
          t.name,
          conditionChips.length ? `⚑ ${conditionChips.join(", ")}` : null,
          hookChips.length ? `⚡ ${hookChips.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        return {
          id: t.id,
          source: t.fromStatusId ?? ANY_STATUS_ID,
          target: t.toStatusId,
          label,
          animated: automated,
          selected: t.id === selectedId,
          style: {
            stroke,
            strokeWidth: t.id === selectedId ? 3 : 1.75,
            strokeDasharray: gated ? "6 3" : undefined,
          },
          labelStyle: {
            fontSize: 11,
            fill: mode === "dark" ? "#dbe1ea" : "#334155",
            whiteSpace: "pre-line",
          },
          labelBgStyle: {
            fill: mode === "dark" ? "#2b323d" : "#ffffff",
            fillOpacity: 0.94,
          },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        };
      }),
    [transitions, selectedId, mode],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const persistLayout = useCallback(() => {
    if (!canEdit) return;
    const payload = nodes
      .filter((n) => n.id !== ANY_STATUS_ID)
      .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));

    startSaving(async () => {
      const result = await saveWorkflowLayoutAction(workflowId, payload);
      if (result.error) setError(result.error);
    });
  }, [canEdit, nodes, workflowId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit || !connection.source || !connection.target) return;
      setError(null);

      const from =
        connection.source === ANY_STATUS_ID ? null : connection.source;

      startSaving(async () => {
        const result = await connectStatusesAction(
          workflowId,
          from,
          connection.target!,
        );
        if (result.error) setError(result.error);
        else router.refresh();
      });
    },
    [canEdit, router, workflowId],
  );

  const selected = useMemo<PanelTransition | null>(() => {
    const t = transitions.find((x) => x.id === selectedId);
    if (!t) return null;
    return {
      id: t.id,
      workflowId,
      name: t.name,
      fromLabel: statusName(t.fromStatusId),
      toLabel: statusName(t.toStatusId),
      conditions: parseConditions(t.conditions),
      hooks: parseHooks(t.hooks),
      statuses: statuses.map((s) => ({ id: s.id, name: s.name })),
    };
  }, [transitions, selectedId, statusName, workflowId, statuses]);

  return (
    <div className="flex h-[620px] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="relative min-w-0 flex-1">
        {error ? (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[13px] text-[var(--color-danger)] shadow-sm">
            <AlertCircle size={15} />
            {error}
          </div>
        ) : null}

        {saving ? (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] text-[var(--color-muted)] shadow-sm">
            <Loader2 size={13} className="animate-spin" />
            Saving
          </div>
        ) : null}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={canEdit ? onNodesChange : undefined}
          onNodeDragStop={persistLayout}
          onConnect={onConnect}
          onEdgeClick={(_, edge) => setSelectedId(edge.id)}
          onPaneClick={() => setSelectedId(null)}
          nodesConnectable={canEdit}
          nodesDraggable={canEdit}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.25 }}
          proOptions={{ hideAttribution: false }}
          colorMode={mode}
        >
          <Background
            gap={16}
            color={mode === "dark" ? "#3a4250" : "#e2e8f0"}
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {selected ? (
        <TransitionPanel
          transition={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
