/**
 * Ends the client side of a session: leave the authenticated layout first, then drop the cache.
 * Clearing while the layout is still mounted makes its live queries (session, unread count) refetch
 * without a session, which shows up as 401s and an uncaught CancelledError.
 */
export async function leaveSession(queryClient: { clear: () => void }, navigateToLogin: () => Promise<unknown>) {
  await navigateToLogin();
  queryClient.clear();
}

/**
 * Starts or stops impersonation: every cached read belonged to the previous identity. `clear()` would
 * orphan the mounted session observers (the banner and topbar then keep showing the old identity until
 * a reload); `resetQueries()` drops the cached data and refetches what is mounted.
 */
export async function swapIdentity(queryClient: { resetQueries: () => Promise<unknown> }) {
  await queryClient.resetQueries();
}
