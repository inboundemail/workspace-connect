import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

const gmail = google.gmail("v1");

export interface GmailServiceOptions {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GmailService {
  private oauth2Client: OAuth2Client;

  constructor(options: GmailServiceOptions) {
    this.oauth2Client = new google.auth.OAuth2(
      options.clientId,
      options.clientSecret,
      options.redirectUri
    );

    this.oauth2Client.setCredentials({
      access_token: options.accessToken,
      refresh_token: options.refreshToken,
    });
  }

  /**
   * Setup Gmail push notifications via Cloud Pub/Sub
   */
  async setupPushNotifications(topicName: string) {
    const response = await gmail.users.watch({
      userId: "me",
      auth: this.oauth2Client,
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
      },
    });

    return {
      historyId: response.data.historyId,
      expiration: response.data.expiration,
    };
  }

  /**
   * Stop push notifications
   */
  async stopPushNotifications() {
    await gmail.users.stop({
      userId: "me",
      auth: this.oauth2Client,
    });
  }

  /**
   * Get history changes since a historyId
   */
  async getHistory(startHistoryId: string, maxResults = 100) {
    const response = await gmail.users.history.list({
      userId: "me",
      auth: this.oauth2Client,
      startHistoryId,
      maxResults,
      historyTypes: ["messageAdded", "messageDeleted"],
    });

    return {
      history: response.data.history || [],
      historyId: response.data.historyId,
    };
  }

  /**
   * Get a specific message
   */
  async getMessage(messageId: string) {
    const response = await gmail.users.messages.get({
      userId: "me",
      auth: this.oauth2Client,
      id: messageId,
      format: "full",
    });

    return response.data;
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
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          contentType: part.mimeType || "application/octet-stream",
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId,
        });
      }

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
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return {
      accessToken: credentials.access_token,
      expiryDate: credentials.expiry_date,
    };
  }
}

