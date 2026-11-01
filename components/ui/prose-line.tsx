import Link from "next/link";

/**
 * One paragraph of guide prose, with just enough markup to write about an
 * interface: `**bold**`, `[text](/href)`, `` `code` `` and `*emphasis*`.
 *
 * Deliberately tiny. The moment this needs a third feature it should become
 * markdown — which the app already renders elsewhere — rather than grow into a
 * templating language nobody documented.
 */
const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*[^*]+\*)/g;

export function ProseLine({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(TOKEN).filter(Boolean);

  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <span key={i} className="font-medium text-[var(--color-ink)]">
              {part.slice(2, -2)}
            </span>
          );
        }

        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <span
              key={i}
              className="rounded bg-[var(--color-surface-3)] px-1 font-mono text-[12.5px]"
            >
              {part.slice(1, -1)}
            </span>
          );
        }

        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          return (
            <Link key={i} href={link[2]!} className="link">
              {link[1]}
            </Link>
          );
        }

        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }

        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
