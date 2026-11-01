import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders markdown to React elements — no `dangerouslySetInnerHTML` anywhere,
 * so a doc written by one person can't inject script into another's page.
 * Raw HTML in the source is deliberately not enabled.
 */
export function Markdown({ children }: { children: string }) {
  if (!children.trim()) {
    return (
      <p className="text-[13px] text-[var(--color-muted)]">
        This doc is empty.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-[14px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h1
              className="mt-5 text-[19px] font-semibold tracking-tight first:mt-0"
              {...props}
            />
          ),
          h2: (props) => (
            <h2
              className="mt-5 text-[16.5px] font-semibold tracking-tight first:mt-0"
              {...props}
            />
          ),
          h3: (props) => (
            <h3
              className="mt-4 text-[14.5px] font-semibold first:mt-0"
              {...props}
            />
          ),
          p: (props) => <p className="leading-relaxed" {...props} />,
          ul: (props) => <ul className="ml-5 list-disc space-y-1" {...props} />,
          ol: (props) => (
            <ol className="ml-5 list-decimal space-y-1" {...props} />
          ),
          li: (props) => <li className="pl-1" {...props} />,
          a: (props) => (
            <a
              className="font-medium text-[var(--color-brand)] hover:underline"
              target="_blank"
              rel="noreferrer noopener"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="border-l-2 border-[var(--color-line)] pl-3 text-[var(--color-muted)]"
              {...props}
            />
          ),
          code: ({ className, ...props }) =>
            className?.includes("language-") ? (
              <code
                className="block overflow-x-auto text-[12.5px]"
                {...props}
              />
            ) : (
              <code
                className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 font-mono text-[12.5px]"
                {...props}
              />
            ),
          pre: (props) => (
            <pre
              className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-3)] p-3 text-[var(--color-ink)] scroll-thin"
              {...props}
            />
          ),
          hr: () => <hr className="border-[var(--color-line)]" />,
          table: (props) => (
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base min-w-[380px]" {...props} />
            </div>
          ),
          input: (props) => (
            // GFM task lists: read-only in the rendered view.
            <input
              className="mr-1 accent-[var(--color-brand)]"
              disabled
              {...props}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
