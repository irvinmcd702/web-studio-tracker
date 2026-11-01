"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CornerDownLeft,
  FileBarChart,
  FileText,
  FolderKanban,
  GitBranch,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  Search,
  Settings,
  UserCog,
  Users,
} from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { useFocusTrap } from "@/components/ui/use-focus-trap";
import { cn } from "@/lib/utils";

export const OPEN_PALETTE_EVENT = "studio-tracker:open-palette";

type Item = {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  badge?: string;
  color?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  run?: () => void;
};

type Group = { id: string; label: string; items: Item[] };

type Command = Item & { keywords: string; adminOnly?: boolean };

const COMMANDS: Command[] = [
  {
    id: "go-dashboard",
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    keywords: "home overview",
  },
  {
    id: "go-projects",
    title: "Projects",
    href: "/projects",
    icon: FolderKanban,
    keywords: "project list",
  },
  {
    id: "go-tasks",
    title: "My tasks",
    href: "/my-tasks",
    icon: ListChecks,
    keywords: "assigned to me",
  },
  {
    id: "go-timesheet",
    title: "Timesheet",
    href: "/timesheet",
    icon: CalendarClock,
    keywords: "hours time week log",
  },
  {
    id: "go-docs",
    title: "Docs",
    href: "/docs",
    icon: FileText,
    keywords: "brief spec notes documents",
  },
  {
    id: "go-requests",
    title: "Requests",
    href: "/requests",
    icon: Inbox,
    keywords: "inbox leads intake",
  },
  {
    id: "go-reports",
    title: "Reports",
    href: "/reports",
    icon: FileBarChart,
    keywords: "money invoice period csv",
    adminOnly: true,
  },
  {
    id: "go-clients",
    title: "Clients",
    href: "/clients",
    icon: Building2,
    keywords: "customers companies",
    adminOnly: true,
  },
  {
    id: "go-teams",
    title: "Teams",
    href: "/teams",
    icon: Users,
    keywords: "people groups",
    adminOnly: true,
  },
  {
    id: "go-workflows",
    title: "Workflows",
    href: "/workflows",
    icon: GitBranch,
    keywords: "statuses transitions process",
    adminOnly: true,
  },
  {
    id: "go-people",
    title: "People",
    href: "/people",
    icon: UserCog,
    keywords: "staff users invite",
    adminOnly: true,
  },
  {
    id: "go-settings",
    title: "Studio settings",
    href: "/settings",
    icon: Settings,
    keywords: "portal defaults rocket chat integration",
    adminOnly: true,
  },
  {
    id: "go-tokens",
    title: "API tokens",
    href: "/tokens",
    icon: KeyRound,
    keywords: "agent mcp claude integration key",
  },
  {
    id: "new-project",
    title: "New project",
    subtitle: "Create a project",
    href: "/projects/new",
    icon: Plus,
    keywords: "create add",
  },
];

export function CommandPalette({ canConfigure }: { canConfigure: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const [, startTransition] = useTransition();

  const dialogRef = useFocusTrap<HTMLDivElement>(open, { autoFocus: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMac(/mac/i.test(navigator.platform));
  }, []);

  // ⌘K anywhere, plus a button in the sidebar for people who don't know it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onRequest = () => setOpen(true);

    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onRequest);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onRequest);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      document.body.style.overflow = "hidden";
      // Focus after paint so the caret lands in the field.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      document.body.style.overflow = "";
    }
  }, [open]);

  // Debounced fetch; a stale response must never overwrite a newer one.
  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(query)}`,
            { signal: controller.signal },
          );
          if (!res.ok) throw new Error("search failed");
          const data = (await res.json()) as { groups: Group[] };
          setRemote(data.groups ?? []);
        } catch {
          if (!controller.signal.aborted) setRemote([]);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query ? 140 : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const commandGroup = useMemo<Group | null>(() => {
    const needle = query.trim().toLowerCase();
    const available = COMMANDS.filter((c) => canConfigure || !c.adminOnly);

    const matched = needle
      ? available.filter(
          (c) =>
            c.title.toLowerCase().includes(needle) ||
            c.keywords.includes(needle),
        )
      : available.slice(0, 6);

    if (!matched.length) return null;
    return {
      id: "commands",
      label: needle ? "Commands" : "Jump to",
      items: matched,
    };
  }, [query, canConfigure]);

  const signOut: Group = useMemo(
    () => ({
      id: "session",
      label: "Session",
      items: [
        {
          id: "sign-out",
          title: "Sign out",
          icon: LogOut,
          run: () => startTransition(() => void logoutAction()),
        },
      ],
    }),
    [],
  );

  const groups = useMemo(() => {
    const list: Group[] = [];
    if (commandGroup) list.push(commandGroup);
    list.push(...remote);
    if (
      query.trim().length > 2 &&
      "sign out".includes(query.trim().toLowerCase())
    ) {
      list.push(signOut);
    }
    return list;
  }, [commandGroup, remote, query, signOut]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setActive(0);
  }, [groups.length, query]);

  const choose = useCallback(
    (item: Item) => {
      setOpen(false);
      if (item.run) item.run();
      else if (item.href) router.push(item.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[active];
      if (item) choose(item);
    }
  };

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let index = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--color-scrim)] p-4 backdrop-blur-[2px] sm:pt-[12vh]">
      <div
        className="absolute inset-0"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--color-line)] px-4">
          <Search size={16} className="shrink-0 text-[var(--color-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search projects, tickets and people, or type a command"
            placeholder="Search projects, tickets, people — or type a command"
            className="flex-1 bg-transparent py-3.5 text-[14px] outline-none placeholder:text-[var(--color-faint)]"
          />
          {loading ? (
            <span className="text-[11.5px] text-[var(--color-muted)]">…</span>
          ) : null}
          <kbd className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-muted)]">
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto py-2 scroll-thin"
        >
          {flat.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--color-muted)]">
              {loading ? "Searching…" : `Nothing found for “${query}”`}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="mb-1">
                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {group.label}
                </p>

                {group.items.map((item) => {
                  index += 1;
                  const i = index;
                  const Icon = item.icon;
                  const isActive = i === active;

                  return (
                    <button
                      key={`${group.id}-${item.id}`}
                      type="button"
                      data-index={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(item)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left transition",
                        isActive
                          ? "bg-[var(--color-brand-soft)]"
                          : "hover:bg-[var(--color-hover)]",
                      )}
                    >
                      {Icon ? (
                        <Icon
                          size={16}
                          className={cn(
                            "shrink-0",
                            isActive
                              ? "text-[var(--color-brand)]"
                              : "text-[var(--color-muted)]",
                          )}
                        />
                      ) : (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color ?? "#cbd5e1" }}
                        />
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">
                          {item.title}
                        </span>
                        {item.subtitle ? (
                          <span className="block truncate text-[12px] text-[var(--color-muted)]">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>

                      {item.badge ? (
                        <span className="shrink-0 rounded-full bg-[var(--color-surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-2)]">
                          {item.badge}
                        </span>
                      ) : null}

                      {isActive ? (
                        <CornerDownLeft
                          size={13}
                          className="shrink-0 text-[var(--color-brand)]"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-[var(--color-line)] px-4 py-2 text-[11.5px] text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-[var(--color-line)] px-1 py-0.5">
              ↑
            </kbd>
            <kbd className="rounded border border-[var(--color-line)] px-1 py-0.5">
              ↓
            </kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-[var(--color-line)] px-1 py-0.5">
              ↵
            </kbd>
            open
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <kbd className="rounded border border-[var(--color-line)] px-1 py-0.5">
              {isMac ? "⌘" : "ctrl"}
            </kbd>
            <kbd className="rounded border border-[var(--color-line)] px-1 py-0.5">
              K
            </kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Sidebar affordance — the shortcut is useless if nobody knows it exists. */
export function CommandPaletteTrigger() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/mac/i.test(navigator.platform));
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      className="mb-2 flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-line)] px-3 py-2 text-[13px] text-[var(--color-muted)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-hover)]"
    >
      <Search size={15} />
      <span className="flex-1 text-left">Search</span>
      <kbd className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10.5px]">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
