import type {
  WorkspaceConnectRequest,
  WorkspaceConnectContext,
  GmailPubSubMessage,
  GmailNotificationData,
} from "../../types";
import { jsonResponse, errorResponse } from "../../core/utils";

export type WatchManagementCallback = (params: {
  connectionId: string;
  action: "start" | "stop";
  context: WorkspaceConnectContext;
}) => Promise<void>;

export type WatchRefreshCallback = (context: WorkspaceConnectContext) => Promise<void>;

export type GmailPubSubCallback = (params: {
  emailAddress: string;
  historyId: string;
  context: WorkspaceConnectContext;
}) => Promise<void>;

/**
 * Handle watch start/stop requests
 */
export function createWatchHandler(callback: WatchManagementCallback) {
  return async (request: WorkspaceConnectRequest, context: WorkspaceConnectContext) => {
    try {
      const body = (await request.json()) as { connectionId?: string };
      const { connectionId } = body;

      if (!connectionId) {
        return errorResponse("connectionId is required", 400);
      }

      const action = request.method === "DELETE" ? "stop" : "start";
      await callback({ connectionId, action, context });

      return jsonResponse({ success: true });
    } catch (error) {
      console.error("Error managing watch:", error);
      return errorResponse(
        error instanceof Error ? error.message : "Failed to manage watch"
      );
    }
  };
}

/**
 * Handle watch refresh cron requests
 */
export function createWatchRefreshHandler(
  cronSecret: string,
  callback: WatchRefreshCallback
) {
  return async (request: WorkspaceConnectRequest, context: WorkspaceConnectContext) => {
    try {
      const auth = request.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return new Response("Unauthorized", { status: 401 });
      }

      await callback(context);

      return jsonResponse({
        success: true,
        message: "Watch refresh completed",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error refreshing watches:", error);
      return errorResponse(
        error instanceof Error ? error.message : "Failed to refresh watches"
      );
    }
  };
}

/**
 * Handle Gmail Pub/Sub webhook notifications
 */
export function createGmailPubSubHandler(callback: GmailPubSubCallback) {
  return async (request: WorkspaceConnectRequest, context: WorkspaceConnectContext) => {
    try {
      const body = (await request.json()) as GmailPubSubMessage;

      // Validate Pub/Sub message format
      if (!body.message?.data) {
        return errorResponse("Invalid Pub/Sub message format", 400);
      }

      // Decode the base64 data
      const decoded = Buffer.from(body.message.data, "base64").toString("utf-8");
      const data: GmailNotificationData = JSON.parse(decoded);

      const { emailAddress, historyId } = data;

      if (!emailAddress || !historyId) {
        return errorResponse("Invalid Gmail notification data", 400);
      }

      console.log(
        `Received Gmail notification for ${emailAddress}, historyId: ${historyId}`
      );

      // Process the notification
      await callback({ emailAddress, historyId, context });

      return jsonResponse({ success: true });
    } catch (error) {
      console.error("Error processing Gmail Pub/Sub notification:", error);
      return errorResponse(
        error instanceof Error ? error.message : "Failed to process notification"
      );
    }
  };
}

