import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    ...(import.meta.env.VITE_GITHUB_PAGES === "true" ? { basepath: "/obsidian-dnd-master." } : {}),
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};