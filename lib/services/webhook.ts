import { db } from "../db";
import { webhook, gmailConnection } from "../db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

/**
 * Webhook Service
 *
 * This service manages webhooks and sends notifications when emails are received.
 * The webhook format is designed to match inbound.new spec as closely as possible.
 *
 * Inbound.new webhook format:
 * {
 *   "type": "email.received",
 *   "id": "evt_...",
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "data": {
 *     "id": "msg_...",
 *     "from": { "email": "sender@example.com", "name": "Sender Name" },
 *     "to": [{ "email": "recipient@example.com", "name": "Recipient Name" }],
 *     "subject": "Email Subject",
 *     "text": "Plain text body",
 *     "html": "<p>HTML body</p>",
 *     "thread_id": "thread_...",
 *     "in_reply_to": "<message-id>",
 *     "references": ["<message-id>"],
 *     "attachments": []
 *   }
 * }
 */

export interface WebhookPayload {
  type: "email.received" | "email.sent";
  id: string;
  timestamp: string;
  data: {
    id: string;
    from: {
      email: string;
      name?: string;
    };
    to: Array<{
      email: string;
      name?: string;
    }>;
    cc?: Array<{
      email: string;
      name?: string;
    }>;
    bcc?: Array<{
      email: string;
      name?: string;
    }>;
    subject: string;
    text?: string;
    html?: string;
    snippet?: string;
    thread_id?: string;
    in_reply_to?: string;
    references?: string[];
    attachments?: Array<{
      filename: string;
      contentType: string;
      size: number;
    }>;
    headers?: Record<string, string>;
  };
}

/**
 * Send a webhook notification
 */
export async function sendWebhook(webhookId: string, payload: WebhookPayload) {
  const [webhookConfig] = await db
    .select()
    .from(webhook)
    .where(eq(webhook.id, webhookId))
    .limit(1);

  if (!webhookConfig || !webhookConfig.isActive) {
    console.log(`Webhook ${webhookId} not found or not active`);
    return;
  }

  // Check if this event type is subscribed
  const events = webhookConfig.events as string[];
  if (!events.includes(payload.type)) {
    console.log(`Webhook ${webhookId} not subscribed to ${payload.type}`);
    return;
  }

  try {
    // Create signature for webhook verification
    const signature = createWebhookSignature(
      JSON.stringify(payload),
      webhookConfig.secret || ""
    );

    // Send the webhook
    const response = await fetch(webhookConfig.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-ID": webhookId,
        "User-Agent": "workspace-connect/1.0",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `Webhook ${webhookId} failed with status ${response.status}:`,
        await response.text()
      );
    } else {
      console.log(`Webhook ${webhookId} sent successfully`);
    }
  } catch (error) {
    console.error(`Failed to send webhook ${webhookId}:`, error);
  }
}

/**
 * Send webhooks to all active webhooks for a connection
 */
export async function sendWebhooksForConnection(
  connectionId: string,
  payload: WebhookPayload
) {
  const webhooks = await db
    .select()
    .from(webhook)
    .where(eq(webhook.gmailConnectionId, connectionId));

  await Promise.all(webhooks.map((wh) => sendWebhook(wh.id, payload)));
}

/**
 * Create a webhook signature using HMAC SHA256
 */
export function createWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify a webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = createWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Parse email address string to extract email and name
 * Format: "Name <email@example.com>" or "email@example.com"
 */
export function parseEmailAddress(
  address: string
): { email: string; name?: string } {
  const match = address.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || undefined,
      email: match[2].trim(),
    };
  }
  return { email: address.trim() };
}

/**
 * Parse multiple email addresses
 */
export function parseEmailAddresses(
  addresses: string | string[]
): Array<{ email: string; name?: string }> {
  const addrs = Array.isArray(addresses) ? addresses : [addresses];
  return addrs
    .flatMap((addr) => addr.split(","))
    .map((addr) => parseEmailAddress(addr.trim()));
}
