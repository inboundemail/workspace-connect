import { db } from "../db";
import { gmailConnection, emailLog } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { createGmailAPIService } from "./gmail-api";
import { createSMTPIMAPService } from "./smtp-imap";
import {
  sendWebhooksForConnection,
  parseEmailAddress,
  parseEmailAddresses,
  type WebhookPayload,
} from "./webhook";

/**
 * Email Watcher Service
 *
 * This service manages watching for new emails across different connection types:
 * - Gmail API: Sets up push notifications via Pub/Sub
 * - SMTP/IMAP: Maintains IMAP IDLE connections
 */

// Store active IMAP watchers
const activeWatchers = new Map<string, () => Promise<void>>();

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

  if (connection.connectionType === "api") {
    // Setup Gmail API push notifications
    await startGmailAPIWatch(connection);
  } else {
    // Setup IMAP IDLE watch
    await startIMAPWatch(connection);
  }
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

  if (connection.connectionType === "api") {
    // Stop Gmail API push notifications
    await stopGmailAPIWatch(connection);
  } else {
    // Stop IMAP watch
    await stopIMAPWatch(connectionId);
  }
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
 * Start IMAP IDLE watch
 */
async function startIMAPWatch(connection: any) {
  try {
    // Don't start if already watching
    if (activeWatchers.has(connection.id)) {
      console.log(`Already watching ${connection.email} via IMAP`);
      return;
    }

    const service = await createSMTPIMAPService(connection.id);

    // Setup IMAP IDLE watch
    const stopWatcher = await service.watchForNewEmails(async (email) => {
      console.log(`New email received via IMAP: ${email.subject} from ${email.from}`);

      // Get full message details
      const thread = await service.getThread(email.threadId);
      const message = thread.messages.find((m) => m.uid === email.uid);

      if (!message) {
        console.error(`Could not find message ${email.uid} in thread`);
        return;
      }

      // Store in email log
      const logId = crypto.randomUUID();
      await db.insert(emailLog).values({
        id: logId,
        gmailConnectionId: connection.id,
        messageId: message.messageId,
        threadId: message.threadId,
        from: message.from,
        to: [message.to],
        subject: message.subject,
        snippet: message.body.text?.substring(0, 150) || "",
        direction: "inbound",
        status: "received",
        rawPayload: message,
        createdAt: new Date(),
      });

      // Create webhook payload
      const webhookPayload: WebhookPayload = {
        type: "email.received",
        id: `evt_${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        data: {
          id: message.messageId,
          from: parseEmailAddress(message.from),
          to: parseEmailAddresses(message.to),
          subject: message.subject,
          text: message.body.text,
          html: message.body.html,
          thread_id: message.threadId,
        },
      };

      // Send to all webhooks for this connection
      await sendWebhooksForConnection(connection.id, webhookPayload);
    });

    // Store the stop function
    activeWatchers.set(connection.id, stopWatcher);

    console.log(`Started IMAP watch for ${connection.email}`);
  } catch (error) {
    console.error(`Failed to start IMAP watch for ${connection.email}:`, error);
    throw error;
  }
}

/**
 * Stop IMAP watch
 */
async function stopIMAPWatch(connectionId: string) {
  const stopWatcher = activeWatchers.get(connectionId);
  if (stopWatcher) {
    await stopWatcher();
    activeWatchers.delete(connectionId);
    console.log(`Stopped IMAP watch for connection ${connectionId}`);
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
