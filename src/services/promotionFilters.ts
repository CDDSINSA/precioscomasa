// PostgREST trims unquoted IN values. Preserve the spaces in the universal
// segment stored by the importer (" - ") by quoting every string literal.
export function promotionSegmentFilter(segments: string[]) {
  return `(${segments.map((segment) => JSON.stringify(segment)).join(",")})`;
}
