export function commitAccountScopedResult<T>(
  ownerId: string,
  currentUserId: () => string | null,
  value: T,
  commit: (value: T) => void,
): boolean {
  if (currentUserId() !== ownerId) return false;
  commit(value);
  return true;
}
