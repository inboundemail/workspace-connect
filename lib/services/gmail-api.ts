import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { db } from "../db";
import { gmailConnection, emailLog, webhook } from "../db/schema";
import { eq } from "drizzle-orm";

const gmail = google.gmail("v1");

/**
 * Gmail API Service
 *
 * This service provides a wrapper around the Gmail API for:
 * - Sending emails
 * - Receiving emails via push notifications
 * - Managing threads
 * - Syncing via history API
 */
export class GmailAPIService {
  private oauth2Client: OAuth2Client;

  constructor(accessToken: string, refreshToken: string) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BETTER_AUTH_URL}/api/auth/callback/google`
    );

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  /**
   * Send an email via Gmail API
   * This matches the Resend API format as much as possible
   */
  async sendEmail(params: {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    cc?: string | string[];
    bcc?: string | string[];
    reply_to?: string | string[];
    attachments?: Array<{
      filename: string;
      content: string | Buffer;
      contentType?: string;
    }>;
    // For threading
    in_reply_to?: string; // Message-ID to reply to
    references?: string[]; // Message-ID references for threading
    thread_id?: string; // Gmail thread ID to attach to
  }) {
    // Build the email in RFC 2822 format
    const lines: string[] = [];

    // Headers
    lines.push(`From: ${params.from}`);
    lines.push(`To: ${Array.isArray(params.to) ? params.to.join(", ") : params.to}`);
    lines.push(`Subject: ${params.subject}`);

    if (params.cc) {
      lines.push(`Cc: ${Array.isArray(params.cc) ? params.cc.join(", ") : params.cc}`);
    }

    if (params.bcc) {
      lines.push(`Bcc: ${Array.isArray(params.bcc) ? params.bcc.join(", ") : params.bcc}`);
    }

    if (params.reply_to) {
      lines.push(`Reply-To: ${Array.isArray(params.reply_to) ? params.reply_to.join(", ") : params.reply_to}`);
    }

    // Threading headers
    if (params.in_reply_to) {
      lines.push(`In-Reply-To: ${params.in_reply_to}`);
    }

    if (params.references && params.references.length > 0) {
      lines.push(`References: ${params.references.join(" ")}`);
    }

    lines.push(`Content-Type: ${params.html ? "text/html" : "text/plain"}; charset=utf-8`);
    lines.push("");

    // Body
    lines.push(params.html || params.text || "");

    const message = lines.join("\r\n");

    // Base64url encode the message
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        auth: this.oauth2Client,
        requestBody: {
          raw: encodedMessage,
          threadId: params.thread_id,
        },
      });

      return {
        id: response.data.id,
        threadId: response.data.threadId,
        labelIds: response.data.labelIds,
      };
    } catch (error) {
      console.error("Failed to send email:", error);
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  /**
   * List threads with pagination
   */
  async listThreads(params?: {
    maxResults?: number;
    pageToken?: string;
    q?: string; // Gmail search query
    labelIds?: string[];
  }) {
    try {
      const response = await gmail.users.threads.list({
        userId: "me",
        auth: this.oauth2Client,
        maxResults: params?.maxResults || 50,
        pageToken: params?.pageToken,
        q: params?.q,
        labelIds: params?.labelIds || ["INBOX"],
      });

      return {
        threads: response.data.threads || [],
        nextPageToken: response.data.nextPageToken,
        resultSizeEstimate: response.data.resultSizeEstimate,
      };
    } catch (error) {
      console.error("Failed to list threads:", error);
      throw new Error(`Failed to list threads: ${error}`);
    }
  }

  /**
   * Get a specific thread with all messages
   */
  async getThread(threadId: string) {
    try {
      const response = await gmail.users.threads.get({
        userId: "me",
        auth: this.oauth2Client,
        id: threadId,
        format: "full",
      });

      return response.data;
    } catch (error) {
      console.error("Failed to get thread:", error);
      throw new Error(`Failed to get thread: ${error}`);
    }
  }

  /**
   * Get a specific message
   */
  async getMessage(messageId: string) {
    try {
      const response = await gmail.users.messages.get({
        userId: "me",
        auth: this.oauth2Client,
        id: messageId,
        format: "full",
      });

      return response.data;
    } catch (error) {
      console.error("Failed to get message:", error);
      throw new Error(`Failed to get message: ${error}`);
    }
  }

  /**
   * Setup Gmail push notifications via Cloud Pub/Sub
   * This allows real-time notifications when emails arrive
   */
  async setupPushNotifications(topicName: string) {
    try {
      const response = await gmail.users.watch({
        userId: "me",
        auth: this.oauth2Client,
        requestBody: {
          topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/${topicName}`,
          labelIds: ["INBOX"],
        },
      });

      return {
        historyId: response.data.historyId,
        expiration: response.data.expiration,
      };
    } catch (error) {
      console.error("Failed to setup push notifications:", error);
      throw new Error(`Failed to setup push notifications: ${error}`);
    }
  }

  /**
   * Stop push notifications
   */
  async stopPushNotifications() {
    try {
      await gmail.users.stop({
        userId: "me",
        auth: this.oauth2Client,
      });
    } catch (error) {
      console.error("Failed to stop push notifications:", error);
      throw new Error(`Failed to stop push notifications: ${error}`);
    }
  }

  /**
   * Get history changes since a historyId
   * This is used to sync new emails after receiving a push notification
   */
  async getHistory(startHistoryId: string, maxResults?: number) {
    try {
      const response = await gmail.users.history.list({
        userId: "me",
        auth: this.oauth2Client,
        startHistoryId,
        maxResults: maxResults || 100,
        historyTypes: ["messageAdded", "messageDeleted"],
      });

      return {
        history: response.data.history || [],
        historyId: response.data.historyId,
      };
    } catch (error) {
      console.error("Failed to get history:", error);
      throw new Error(`Failed to get history: ${error}`);
    }
  }

  /**
   * Parse Gmail message to extract key fields
   */
  static parseMessage(message: any) {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds || [],
      snippet: message.snippet || "",
      from: getHeader("from"),
      to: getHeader("to"),
      subject: getHeader("subject"),
      date: getHeader("date"),
      messageId: getHeader("message-id"),
      inReplyTo: getHeader("in-reply-to"),
      references: getHeader("references"),
      body: this.extractBody(message.payload),
    };
  }

  /**
   * Extract body from Gmail message payload
   */
  private static extractBody(payload: any): { text?: string; html?: string } {
    if (payload.body?.data) {
      const decoded = Buffer.from(payload.body.data, "base64").toString("utf-8");
      return payload.mimeType === "text/html" ? { html: decoded } : { text: decoded };
    }

    if (payload.parts) {
      const result: { text?: string; html?: string } = {};
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          result.text = Buffer.from(part.body.data, "base64").toString("utf-8");
        } else if (part.mimeType === "text/html" && part.body?.data) {
          result.html = Buffer.from(part.body.data, "base64").toString("utf-8");
        } else if (part.parts) {
          const nested = this.extractBody(part);
          result.text = result.text || nested.text;
          result.html = result.html || nested.html;
        }
      }
      return result;
    }

    return {};
  }

  /**
   * Extract attachments from Gmail message payload
   */
  static extractAttachments(payload: any): Array<{
    filename: string;
    contentType: string;
    size: number;
    attachmentId: string;
  }> {
    const attachments: Array<{
      filename: string;
      contentType: string;
      size: number;
      attachmentId: string;
    }> = [];

    const processPart = (part: any) => {
      // Check if this part is an attachment
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          contentType: part.mimeType || "application/octet-stream",
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId,
        });
      }

      // Recursively process nested parts
      if (part.parts) {
        for (const nestedPart of part.parts) {
          processPart(nestedPart);
        }
      }
    };

    if (payload.parts) {
      for (const part of payload.parts) {
        processPart(part);
      }
    } else if (payload.filename && payload.body?.attachmentId) {
      // Single attachment
      attachments.push({
        filename: payload.filename,
        contentType: payload.mimeType || "application/octet-stream",
        size: payload.body.size || 0,
        attachmentId: payload.body.attachmentId,
      });
    }

    return attachments;
  }

  /**
   * Refresh access token if needed
   */
  async refreshAccessToken() {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return {
        accessToken: credentials.access_token,
        expiryDate: credentials.expiry_date,
      };
    } catch (error) {
      console.error("Failed to refresh access token:", error);
      throw new Error(`Failed to refresh access token: ${error}`);
    }
  }
}

/**
 * Create a Gmail API service instance from a connection ID
 */
export async function createGmailAPIService(connectionId: string) {
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

  if (!connection.gmailAccessToken || !connection.gmailRefreshToken) {
    throw new Error("Gmail connection missing tokens");
  }

  const service = new GmailAPIService(
    connection.gmailAccessToken,
    connection.gmailRefreshToken
  );

  // Check if token needs refresh
  if (connection.gmailTokenExpiry && new Date(connection.gmailTokenExpiry) < new Date()) {
    const { accessToken, expiryDate } = await service.refreshAccessToken();

    // Update the connection with new token
    await db
      .update(gmailConnection)
      .set({
        gmailAccessToken: accessToken || "",
        gmailTokenExpiry: expiryDate ? new Date(expiryDate) : null,
        updatedAt: new Date(),
      })
      .where(eq(gmailConnection.id, connectionId));
  }

  return service;
}
