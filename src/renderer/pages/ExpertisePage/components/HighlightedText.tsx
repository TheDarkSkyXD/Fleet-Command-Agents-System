/**
 * Highlights occurrences of a search query within text.
 * Returns an array of React elements with <mark> tags around matches.
 */
export function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || query.trim().length === 0) {
    return <>{text}</>;
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = regex.test(part);
        // Reset regex lastIndex since it's stateful with 'g' flag
        regex.lastIndex = 0;
        return isMatch ? (
          <mark
            key={`${i}-${part}`}
            className="bg-yellow-500/30 text-yellow-200 rounded px-0.5"
            data-testid="search-highlight"
          >
            {part}
          </mark>
        ) : (
          <span key={`${i}-${part}`}>{part}</span>
        );
      })}
    </>
  );
}
