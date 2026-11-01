import { splitMentions } from "@/lib/mentions";

/**
 * Body text with the handles that resolved shown as handles.
 *
 * Only the ones that resolved: `@dana` is marked because Dana was told, and
 * `@nobody` stays plain text because nobody was. Highlighting a mention that
 * went nowhere would be the interface claiming something it did not do.
 *
 * The stored body is exactly what was typed — this is rendering, not storage.
 */
export function MentionText({
  body,
  handles,
  className,
}: {
  body: string;
  handles: string[];
  className?: string;
}) {
  const parts = splitMentions(body, new Set(handles));

  return (
    <p className={className}>
      {parts.map((part, i) =>
        part.mention ? (
          <span
            key={i}
            className="rounded bg-[var(--color-brand-soft)] px-1 font-medium text-[var(--color-brand)]"
          >
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}
