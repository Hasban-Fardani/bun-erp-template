/**
 * Ends the client side of a session: leave the authenticated layout first, then drop the cache.
 * Clearing while the layout is still mounted makes its live queries (session, unread count) refetch
 * without a session, which shows up as 401s and an uncaught CancelledError.
 */
export async function leaveSession(queryClient: { clear: () => void }, navigateToLogin: () => Promise<unknown>) {
  await navigateToLogin();
  queryClient.clear();
}
