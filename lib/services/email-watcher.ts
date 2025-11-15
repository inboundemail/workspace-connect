import { db } from "../db";
import { gmailConnection } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { createGmailAPIService } from "./gmail-api";

/**
 * Email Watcher Service
 *
 * This service manages watching for new emails using Gmail API push notifications via Pub/Sub.
 */

/**
 * Start watching a Gmail connection for new emails
 */
export async function startWatching(connectionId: string) {
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new Error("Gmail connection not found");
  }

  if (!connection.isActive) {
    throw new Error("Gmail connection is not active");
  }

  if (connection.connectionType !== "api") {
    throw new Error("Connection is not configured for Gmail API");
  }

  // Setup Gmail API push notifications
  await startGmailAPIWatch(connection);
}

/**
 * Stop watching a Gmail connection
 */
export async function stopWatching(connectionId: string) {
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new Error("Gmail connection not found");
  }

  if (connection.connectionType !== "api") {
    throw new Error("Connection is not configured for Gmail API");
  }

  // Stop Gmail API push notifications
  await stopGmailAPIWatch(connection);
}

/**
 * Start Gmail API watch with push notifications
 */
async function startGmailAPIWatch(connection: any) {
  try {
    const service = await createGmailAPIService(connection.id);

    // Setup push notifications (watch)
    const result = await service.setupPushNotifications(
      process.env.GOOGLE_PUBSUB_TOPIC || "gmail-notifications"
    );

    // Update connection with watch info
    await db
      .update(gmailConnection)
      .set({
        gmailHistoryId: result.historyId || "",
        gmailWatchExpiration: result.expiration
          ? new Date(parseInt(result.expiration))
          : null,
        updatedAt: new Date(),
      })
      .where(eq(gmailConnection.id, connection.id));

    console.log(
      `Started Gmail API watch for ${connection.email}, expires: ${result.expiration}`
    );
  } catch (error) {
    console.error(`Failed to start Gmail API watch for ${connection.email}:`, error);
    throw error;
  }
}

/**
 * Stop Gmail API watch
 */
async function stopGmailAPIWatch(connection: any) {
  try {
    const service = await createGmailAPIService(connection.id);
    await service.stopPushNotifications();

    // Clear watch info
    await db
      .update(gmailConnection)
      .set({
        gmailWatchExpiration: null,
        updatedAt: new Date(),
      })
      .where(eq(gmailConnection.id, connection.id));

    console.log(`Stopped Gmail API watch for ${connection.email}`);
  } catch (error) {
    console.error(`Failed to stop Gmail API watch for ${connection.email}:`, error);
    throw error;
  }
}

/**
 * Refresh Gmail API watch (should be called periodically)
 * Gmail watches expire after 7 days, so we need to refresh them
 */
export async function refreshGmailAPIWatches() {
  const connections = await db
    .select()
    .from(gmailConnection)
    .where(
      and(
        eq(gmailConnection.connectionType, "api"),
        eq(gmailConnection.isActive, true)
      )
    );

  if (!connections) {
    console.log("No active Gmail API connections found");
    return;
  }

  for (const connection of connections) {
    try {
      // Check if watch is expiring soon (within 24 hours)
      if (
        connection.gmailWatchExpiration &&
        new Date(connection.gmailWatchExpiration).getTime() - Date.now() <
          24 * 60 * 60 * 1000
      ) {
        console.log(
          `Refreshing Gmail API watch for ${connection.email} (expiring soon)`
        );
        await startGmailAPIWatch(connection);
      }
    } catch (error) {
      console.error(`Failed to refresh watch for ${connection.email}:`, error);
    }
  }
}
