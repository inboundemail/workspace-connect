import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gmailConnection, emailLog, parsedEmails } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createGmailAPIService, GmailAPIService } from "@/lib/services/gmail-api";
import {
  sendWebhooksForConnection,
  parseEmailAddress,
  parseEmailAddresses,
  type WebhookPayload,
} from "@/lib/services/webhook";

/**
 * /api/webhooks/gmail-pubsub endpoint
 *
 * Receives push notifications from Google Cloud Pub/Sub when Gmail events occur.
 * This is the webhook endpoint that Gmail API calls when new emails arrive.
 *
 * Supports two formats:
 * 1. Pub/Sub format:
 * {
 *   "message": {
 *     "data": "<base64-encoded-json>",
 *     "messageId": "...",
 *     "publishTime": "..."
 *   }
 * }
 *
 * 2. Direct Gmail message format:
 * {
 *   "id": "message-id",
 *   "payload": { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if it's a direct Gmail message (has id and payload)
    if (body.id && body.payload) {
      return await handleDirectGmailMessage(body);
    }

    // Otherwise, handle as Pub/Sub format
    if (!body.message?.data) {
      return NextResponse.json({ error: "Invalid Pub/Sub message" }, { status: 400 });
    }

    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString("utf-8")
    );

    const { emailAddress, historyId } = decoded;

    console.log(`Received Gmail notification for ${emailAddress}, historyId: ${historyId}`);

    // Find the Gmail connection for this email address
    const [connection] = await db
      .select()
      .from(gmailConnection)
      .where(eq(gmailConnection.email, emailAddress))
      .limit(1);

    if (!connection) {
      console.error(`No connection found for ${emailAddress}`);
      return NextResponse.json(
        { error: "Gmail connection not found" },
        { status: 404 }
      );
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing Gmail push notification:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process notification" },
      { status: 500 }
    );
  }
}

/**
 * Handle direct Gmail message format
 */
async function handleDirectGmailMessage(message: any) {
  try {
    // Parse the message using GmailAPIService
    const parsed = GmailAPIService.parseMessage(message);

    // Extract email address from the "To" header to find the connection
    const toHeader = parsed.to;
    if (!toHeader) {
      return NextResponse.json(
        { error: "Message missing 'To' header" },
        { status: 400 }
      );
    }

    // Parse email addresses to find the connection
    const toAddresses = parseEmailAddresses(toHeader);
    let connection = null;

    // Try to find connection by matching any recipient email
    for (const addr of toAddresses) {
      const [conn] = await db
        .select()
        .from(gmailConnection)
        .where(eq(gmailConnection.email, addr.email))
        .limit(1);
      
      if (conn) {
        connection = conn;
        break;
      }
    }

    if (!connection) {
      console.error(`No connection found for message recipients: ${toAddresses.map(a => a.email).join(", ")}`);
      return NextResponse.json(
        { error: "Gmail connection not found for this message" },
        { status: 404 }
      );
    }

    // Check if message already exists (prevent duplicates)
    const [existing] = await db
      .select()
      .from(emailLog)
      .where(
        and(
          eq(emailLog.gmailConnectionId, connection.id),
          eq(emailLog.messageId, parsed.id)
        )
      )
      .limit(1);

    if (existing) {
      console.log(`Message ${parsed.id} already exists, skipping duplicate`);
      return NextResponse.json({ 
        success: true, 
        message: "Message already processed",
        duplicate: true 
      });
    }

    // Process the message
    await processDirectMessage(connection.id, message, parsed);

    // Store parsed email
    await storeParsedEmail(connection.id, message, parsed);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing direct Gmail message:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process message" },
      { status: 500 }
    );
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

    // Check if message already exists (prevent duplicates)
    const [existing] = await db
      .select()
      .from(emailLog)
      .where(
        and(
          eq(emailLog.gmailConnectionId, connectionId),
          eq(emailLog.messageId, parsed.id)
        )
      )
      .limit(1);

    if (existing) {
      console.log(`Message ${parsed.id} already exists, skipping duplicate`);
      return;
    }

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
 * Process a direct Gmail message (already parsed)
 */
async function processDirectMessage(
  connectionId: string,
  fullMessage: any,
  parsed: any
) {
  try {
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

    console.log(`Processed direct message ${parsed.id} and triggered webhooks`);
  } catch (error) {
    console.error(`Failed to process direct message ${parsed.id}:`, error);
    throw error;
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
