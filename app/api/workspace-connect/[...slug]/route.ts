import { workspaceConnectHandler, gmailProvider } from "workspace-connect/next";
import { auth } from "@/lib/auth";
import { startWatching, stopWatching, refreshGmailAPIWatches } from "@/lib/services/email-watcher";
import { handleGmailPubSubNotification } from "@/lib/services/gmail-notification-handler";

/**
 * Workspace Connect API Handler
 * 
 * This is the main entry point for all Workspace Connect operations:
 * - POST /api/workspace-connect/watch - Start watching a connection
 * - DELETE /api/workspace-connect/watch - Stop watching a connection
 * - POST /api/workspace-connect/providers/gmail - Gmail Pub/Sub webhook
 * - GET /api/workspace-connect/cron/watch-refresh - Refresh watches (cron job)
 */
export const { GET, POST, DELETE } = workspaceConnectHandler({
  identify: async (request) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    return {
      customerId: session?.user.id,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
  providers: [
    gmailProvider({
      cronSecret: process.env.CRON_SECRET || "",
      
      onWatchManagement: async ({ connectionId, action, context }) => {
        console.log(`[Workspace Connect] ${action} watch for connection: ${connectionId}`);
        
        if (action === "start") {
          await startWatching(connectionId);
        } else {
          await stopWatching(connectionId);
        }
      },
      
      onWatchRefresh: async (context) => {
        console.log("[Workspace Connect] Refreshing all Gmail API watches...");
        await refreshGmailAPIWatches();
      },
      
      onPubSubNotification: async ({ emailAddress, historyId, context }) => {
        console.log(
          `[Workspace Connect] Gmail notification for ${emailAddress}, historyId: ${historyId}`
        );
        await handleGmailPubSubNotification(emailAddress, historyId);
      },
    }),
  ],
});

