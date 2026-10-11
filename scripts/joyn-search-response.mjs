// Joyn's SearchResultItem resolver can fail on non-catalog compilation items.
// Only the precisely observed null result is excluded; other errors remain fatal.
export function excludedJoynSearchItems(body) {
  const results = body?.data?.search?.results
  const errors = body?.errors
  if (!Array.isArray(results) || !Array.isArray(errors) || !errors.length) return 0
  const indices = []
  for (const error of errors) {
    const path = error?.path
    if (error?.extensions?.code !== 'INTERNAL_SERVER_ERROR'
        || error.message !== "Type 'COMPILATION_ITEM' not supported"
        || !Array.isArray(path) || path.length !== 3
        || path[0] !== 'search' || path[1] !== 'results'
        || !Number.isInteger(path[2]) || path[2] < 0 || path[2] >= results.length
        || results[path[2]] !== null) return 0
    indices.push(path[2])
  }
  return new Set(indices).size
}
