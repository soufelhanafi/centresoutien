type JsonLdProps = {
  data: Record<string, unknown>;
  // Optional DOM id, useful when several JSON-LD blocks live on one page.
  id?: string;
};

/**
 * Emits a single JSON-LD structured-data block.
 *
 * `data` is always our own static, server-built object (see lib/structured-data.ts),
 * never user input — so JSON.stringify + dangerouslySetInnerHTML is the standard,
 * safe pattern for structured data. This stays a Server Component.
 */
export function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
