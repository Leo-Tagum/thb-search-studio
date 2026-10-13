import { parseInline } from "@/lib/studio/inline";

/** Reader-visible rendering of an agent-written string (**bold** and https links only). parseInline escapes everything else, so the HTML it returns is safe. */
export function Inline({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: parseInline(text).html }} />;
}
