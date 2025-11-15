import { PubSub } from "@google-cloud/pubsub";
import { db } from "../db";
import { gmailConnection, emailLog, parsedEmails } from "../db/schema";
import { eq } from "drizzle-orm";
import { createGmailAPIService, GmailAPIService } from "./gmail-api";
import {
  sendWebhooksForConnection,
  parseEmailAddress,
  parseEmailAddresses,
  type WebhookPayload,
} from "./webhook";

/**
 * Gmail Pub/Sub Poller
 *
 * This service polls the Pub/Sub subscription for Gmail notifications
 * instead of using push notifications. This works around organization
 * policies that block external service accounts.
 *
 * Usage:
 * - Run this in a background process or cron job
 * - Call pollForNotifications() periodically (e.g., every 10 seconds)
 */

const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

const subscriptionName = "gmail-sub";

/**
 * Poll for Gmail notifications from Pub/Sub
 */
export async function pollForNotifications() {
  const subscription = pubsub.subscription(subscriptionName);

  try {
    // Pull messages (max 10 at a time)
    // @ts-ignore - Pull API exists but types may not be up to date
    const [messages] = await subscription.pull({ maxMessages: 10 });

    console.log(`Received ${messages.length || 0} Gmail notifications`);

    if (!messages || messages.length === 0) {
      return;
    }

    for (const message of messages) {
      try {
        // Decode the Pub/Sub message
        const data = JSON.parse(message.data.toString("utf-8"));
        const { emailAddress, historyId } = data;

        console.log(
          `Processing notification for ${emailAddress}, historyId: ${historyId}`
        );

        // Find the Gmail connection
        const [connection] = await db
          .select()
          .from(gmailConnection)
          .where(eq(gmailConnection.email, emailAddress))
          .limit(1);

        if (!connection) {
          console.error(`No connection found for ${emailAddress}`);
          // @ts-ignore - Ack API exists but types may not be up to date
          await subscription.ack([message]);
          continue;
        }

        // Get the Gmail API service
        const service = await createGmailAPIService(connection.id);

        // Get history changes since last sync
        const startHistoryId = connection.gmailHistoryId || historyId;
        const history = await service.getHistory(startHistoryId);

        // Process new messages
        for (const item of history.history) {
          if (item.messagesAdded) {
            for (const addedMsg of item.messagesAdded) {
              await processNewMessage(service, connection.id, addedMsg.message);
            }
          }
        }

        // Update the history ID
        await db
          .update(gmailConnection)
          .set({
            gmailHistoryId: history.historyId,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(gmailConnection.id, connection.id));

        // Acknowledge the message
        // @ts-ignore - Ack API exists but types may not be up to date
        await subscription.ack([message]);
      } catch (error) {
        console.error("Error processing message:", error);
        // Don't ack - message will be redelivered
      }
    }
  } catch (error) {
    console.error("Error polling for notifications:", error);
  }
}

/**
 * Process a new message and trigger webhooks
 */
async function processNewMessage(
  service: any,
  connectionId: string,
  message: any
) {
  try {
    // Get the full message details
    const fullMessage = await service.getMessage(message.id);
    const parsed = GmailAPIService.parseMessage(fullMessage);

    // Store in email log
    const logId = crypto.randomUUID();
    await db.insert(emailLog).values({
      id: logId,
      gmailConnectionId: connectionId,
      messageId: parsed.id,
      threadId: parsed.threadId,
      from: parsed.from,
      to: parseEmailAddresses(parsed.to).map((addr) => addr.email),
      subject: parsed.subject,
      snippet: parsed.snippet,
      direction: "inbound",
      status: "received",
      rawPayload: fullMessage,
      createdAt: new Date(),
    });

    // Create webhook payload in inbound.new format
    const webhookPayload: WebhookPayload = {
      type: "email.received",
      id: `evt_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      data: {
        id: parsed.id,
        from: parseEmailAddress(parsed.from),
        to: parseEmailAddresses(parsed.to),
        subject: parsed.subject,
        text: parsed.body.text,
        html: parsed.body.html,
        snippet: parsed.snippet,
        thread_id: parsed.threadId,
        in_reply_to: parsed.inReplyTo,
        references: parsed.references ? parsed.references.split(" ") : undefined,
        headers: {
          "message-id": parsed.messageId,
          date: parsed.date,
        },
      },
    };

    // Send to all webhooks for this connection
    await sendWebhooksForConnection(connectionId, webhookPayload);

    // Store parsed email
    await storeParsedEmail(connectionId, fullMessage, parsed);

    console.log(`Processed new message ${parsed.id} and triggered webhooks`);
  } catch (error) {
    console.error(`Failed to process message ${message.id}:`, error);
  }
}

/**
 * Store parsed email in parsedEmails table
 */
async function storeParsedEmail(
  connectionId: string,
  rawMessage: any,
  parsed: any
) {
  try {
    // Extract attachments
    const attachments = GmailAPIService.extractAttachments(rawMessage.payload);

    // Parse email addresses
    const toAddresses = parseEmailAddresses(parsed.to || "");

    // Check if parsed email already exists
    const [existing] = await db
      .select()
      .from(parsedEmails)
      .where(eq(parsedEmails.messageId, parsed.id))
      .limit(1);

    const parsedEmailData = {
      id: crypto.randomUUID(),
      gmailConnectionId: connectionId,
      messageId: parsed.id,
      threadId: parsed.threadId,
      from: parsed.from,
      to: toAddresses.map((addr) => addr.email),
      rawEmail: rawMessage,
      html: parsed.body.html || null,
      text: parsed.body.text || null,
      attachments: attachments.length > 0 ? attachments : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (existing) {
      // Update existing record
      await db
        .update(parsedEmails)
        .set({
          ...parsedEmailData,
          id: existing.id, // Keep existing ID
          createdAt: existing.createdAt, // Keep original creation date
        })
        .where(eq(parsedEmails.messageId, parsed.id));
      console.log(`Updated parsed email ${parsed.id}`);
    } else {
      // Insert new record
      await db.insert(parsedEmails).values(parsedEmailData);
      console.log(`Stored parsed email ${parsed.id}`);
    }
  } catch (error) {
    console.error(`Failed to store parsed email ${parsed.id}:`, error);
    // Don't throw - this is not critical for webhook processing
  }
}

/**
 * Start polling in a loop
 * @param intervalMs How often to poll (default: 10 seconds)
 */
export async function startPolling(intervalMs: number = 10000) {
  console.log(`Starting Gmail notification poller (interval: ${intervalMs}ms)`);

  while (true) {
    try {
      await pollForNotifications();
    } catch (error) {
      console.error("Polling error:", error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * One-time poll (useful for cron jobs)
 */
export async function pollOnce() {
  await pollForNotifications();
}
