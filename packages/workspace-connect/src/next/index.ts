import { WorkspaceConnectRouter } from "../core/router";
import type {
  WorkspaceConnectHandlerOptions,
  WorkspaceConnectRequest,
} from "../types";

/**
 * Create a Workspace Connect handler for Next.js App Router
 * 
 * @example
 * ```ts
 * import { workspaceConnectHandler } from "workspace-connect/next";
 * import { gmailProvider } from "workspace-connect/next";
 * 
 * export const { GET, POST, DELETE } = workspaceConnectHandler({
 *   identify: async (request) => {
 *     const session = await auth.api.getSession({ headers: request.headers });
 *     return {
 *       customerId: session?.user.id,
 *       customerData: {
 *         name: session?.user.name,
 *         email: session?.user.email,
 *       },
 *     };
 *   },
 *   providers: [
 *     gmailProvider({
 *       cronSecret: process.env.CRON_SECRET!,
 *       onWatchManagement: async ({ connectionId, action }) => {
 *         // Your implementation
 *       },
 *       onWatchRefresh: async () => {
 *         // Your implementation
 *       },
 *       onPubSubNotification: async ({ emailAddress, historyId }) => {
 *         // Your implementation
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function workspaceConnectHandler(options: WorkspaceConnectHandlerOptions) {
  const router = new WorkspaceConnectRouter(options.providers);

  async function handler(
    request: WorkspaceConnectRequest,
    context: { params: { slug?: string[] } }
  ): Promise<Response> {
    const slug = context.params.slug || [];
    const identity = await options.identify(request);
    return router.dispatch(request, slug, identity);
  }

  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    DELETE: handler,
    PATCH: handler,
  };
}

// Re-export providers for convenience
export { gmailProvider } from "../providers/gmail";
export type {
  GmailProviderOptions,
  WatchManagementCallback,
  WatchRefreshCallback,
  GmailPubSubCallback,
} from "../providers/gmail";

