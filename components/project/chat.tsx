"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { sendChatMessageAction } from "@/app/actions/chat";
import { Avatar, Badge } from "@/components/ui/primitives";
import { FormError, SubmitButton } from "@/components/ui/form";
import { cn, formatDateTime } from "@/lib/utils";
import { MentionText } from "@/components/ui/mention-text";
import {
  MentionTextarea,
  type MentionPerson,
} from "@/components/ui/mention-textarea";

export type ChatItem = {
  id: string;
  body: string;
  createdAt: string;
  isInternal: boolean;
  author: { id: string; name: string; avatarColor: string; role: string };
};

export function ProjectChat({
  projectId,
  messages,
  handles = [],
  people = [],
  currentUserId,
  canPostInternal,
  placeholder,
  emptyMessage = "No messages yet. Send the first one: the client sees it in their portal.",
}: {
  projectId: string;
  messages: ChatItem[];
  /**
   * Two different lists on purpose. `handles` is everyone whose name resolves
   * here, so a mention already sent is shown as one — including your own, when
   * somebody names you. `people` is who you may pick from, which leaves you
   * out, because naming yourself notifies nobody.
   */
  handles?: string[];
  people?: MentionPerson[];
  currentUserId: string;
  canPostInternal: boolean;
  placeholder?: string;
  /** The empty state is read by whoever is looking, so it is passed in. */
  emptyMessage?: string;
}) {
  const [state, action] = useActionState(sendChatMessageAction, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Whether they were watching the end of the conversation when the last
  // message landed. Somebody scrolled up is reading something, and a message
  // arriving every few seconds must not drag them away from it.
  const following = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list && following.current) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      // Your own message is always worth being taken to, wherever you were
      // reading. Moving to the end here rather than only setting the flag:
      // it puts the conversation where the answer will appear, and leaves
      // the container genuinely at the bottom, so nothing that reads the
      // scroll position afterwards can decide otherwise.
      following.current = true;
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
      router.refresh();
    }
  }, [state, router]);

  // Light polling keeps both sides of the conversation roughly in sync.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex h-[calc(100vh-19rem)] min-h-[420px] flex-col">
      <div
        ref={listRef}
        // A little slack, so being a line or two off the end still counts as
        // watching it — nobody scrolls to the exact pixel.
        onScroll={(e) => {
          const list = e.currentTarget;
          following.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < 60;
        }}
        // A region that scrolls has to be reachable by keyboard, or the older
        // messages exist only for people using a mouse. Tab lands here and the
        // arrow keys work; the label is what says where "here" is, since the
        // group would otherwise be announced as an unnamed box.
        tabIndex={0}
        role="log"
        aria-label="Messages"
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scroll-thin"
      >
        {messages.length === 0 ? (
          <p className="mx-auto max-w-[36ch] py-10 text-center text-[13px] leading-relaxed text-[var(--color-muted)]">
            {emptyMessage}
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.author.id === currentUserId;
            return (
              <div
                key={message.id}
                className={cn("flex gap-3", mine && "flex-row-reverse")}
              >
                <Avatar
                  name={message.author.name}
                  color={message.author.avatarColor}
                  size={28}
                />
                <div
                  className={cn("max-w-[75%]", mine && "items-end text-right")}
                >
                  <div
                    className={cn(
                      "mb-1 flex items-center gap-2 text-[11.5px] text-[var(--color-muted)]",
                      mine && "justify-end",
                    )}
                  >
                    <span className="font-medium text-[var(--color-ink)]">
                      {message.author.name}
                    </span>
                    {message.author.role === "CLIENT" ? (
                      <Badge color="#0891b2">client</Badge>
                    ) : null}
                    {message.isInternal ? (
                      <Badge color="#d97706">internal</Badge>
                    ) : null}
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <div
                    className={cn(
                      "inline-block whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed",
                      message.isInternal
                        ? "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                        : mine
                          ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                          : "bg-[var(--color-surface-3)] text-[var(--color-ink)]",
                    )}
                  >
                    <MentionText body={message.body} handles={handles} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        ref={formRef}
        action={action}
        className="space-y-2 border-t border-[var(--color-line)] px-5 py-4"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <FormError message={state?.error} />

        <MentionTextarea
          people={people}
          name="body"
          rows={3}
          required
          aria-label="Message"
          placeholder={
            placeholder ??
            (people.length
              ? "Write a message… type @ to bring somebody in"
              : "Write a message…")
          }
          className="field resize-none"
        />

        <div className="flex items-center justify-between gap-3">
          {canPostInternal ? (
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]">
              <input
                type="checkbox"
                name="isInternal"
                className="accent-amber-500"
              />
              Internal note (hidden from the client)
            </label>
          ) : (
            <span />
          )}
          <SubmitButton size="sm" pendingText="Sending…">
            <Send size={14} />
            Send
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
