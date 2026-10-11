/**
 * Performs the already-established logout request and redirect. Keeping this
 * in one place ensures every dashboard role follows the same confirm-only flow.
 *
 * @param {{ logoutEndpoint: string, redirectTo: string, redirectMethod?: "push" | "replace", router?: { push: (href: string) => void, refresh: () => void }, fetcher?: typeof fetch, replace?: (href: string) => void }} options
 */
async function performLogout({
  logoutEndpoint,
  redirectTo,
  redirectMethod = "push",
  router,
  fetcher = fetch,
  replace = (href) => window.location.replace(href),
}) {
  try {
    await fetcher(logoutEndpoint, { method: "POST" });
  } catch {
    // Existing role flows still redirect when the request cannot be completed.
  }

  if (redirectMethod === "replace") {
    replace(redirectTo);
    return;
  }

  router?.push(redirectTo);
  router?.refresh();
}

module.exports = { performLogout };
