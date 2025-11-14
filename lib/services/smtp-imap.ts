import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import type { MessageStructureObject } from "imapflow";
import { db } from "../db";
import { gmailConnection } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * SMTP/IMAP Service
 *
 * This service provides email functionality using standard protocols:
 * - SMTP for sending emails
 * - IMAP for receiving emails (with IDLE support for real-time notifications)
 * - Uses OAuth2 for authentication with Gmail
 */
export class SMTPIMAPService {
  private accessToken: string;
  private email: string;
  private smtpTransporter: nodemailer.Transporter;

  constructor(accessToken: string, email: string) {
    this.accessToken = accessToken;
    this.email = email;

    // Setup SMTP transporter with OAuth2
    this.smtpTransporter = nodemailer.createTransport({
      host: process.env.GMAIL_SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.GMAIL_SMTP_PORT || "587"),
      secure: false, // true for 465, false for other ports
      auth: {
        type: "OAuth2",
        user: email,
        accessToken: accessToken,
      },
    });
  }

  /**
   * Send an email via SMTP
   * This matches the Resend API format
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
    inReplyTo?: string; // Message-ID to reply to
    references?: string | string[]; // Message-ID references for threading
  }) {
    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        cc: params.cc,
        bcc: params.bcc,
        replyTo: params.reply_to,
        attachments: params.attachments,
        inReplyTo: params.inReplyTo,
        references: params.references,
      };

      const info = await this.smtpTransporter.sendMail(mailOptions);

      return {
        id: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      };
    } catch (error) {
      console.error("Failed to send email via SMTP:", error);
      throw new Error(`Failed to send email via SMTP: ${error}`);
    }
  }

  /**
   * Create an IMAP connection
   */
  private createIMAPConnection() {
    return new ImapFlow({
      host: process.env.GMAIL_IMAP_HOST || "imap.gmail.com",
      port: parseInt(process.env.GMAIL_IMAP_PORT || "993"),
      secure: true,
      auth: {
        user: this.email,
        accessToken: this.accessToken,
      },
      logger: false,
    });
  }

  /**
   * List threads from INBOX using Gmail's X-GM-THRID extension
   * This groups messages by Gmail's thread ID
   */
  async listThreads(params?: {
    limit?: number;
    seen?: boolean;
  }): Promise<Array<{
    threadId: string;
    messages: Array<{
      uid: number;
      messageId: string;
      from: string;
      to: string;
      subject: string;
      date: Date;
      snippet: string;
      flags: string[];
    }>;
  }>> {
    const client = this.createIMAPConnection();

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        // Build search criteria
        const searchCriteria: any = { all: true };
        if (params?.seen !== undefined) {
          searchCriteria.seen = params.seen;
        }

        // Fetch messages with Gmail extensions
        const messages: any[] = [];
        for await (const msg of client.fetch(searchCriteria, {
          envelope: true,
          flags: true,
          bodyStructure: true,
          uid: true,
          // Gmail-specific extensions (using any to allow these)
          "X-GM-THRID": true,
          "X-GM-MSGID": true,
        } as any)) {
          // Get snippet (first 150 chars of body)
          let snippet = "";
          try {
            const { content } = await client.download(msg.uid, "TEXT", {
              maxBytes: 150,
            });
            // content is a Readable stream, convert to string
            const chunks: Buffer[] = [];
            for await (const chunk of content) {
              chunks.push(Buffer.from(chunk));
            }
            snippet = Buffer.concat(chunks).toString("utf-8").trim();
          } catch (e) {
            // Ignore snippet errors
          }

          messages.push({
            uid: msg.uid,
            messageId: msg.envelope?.messageId || "",
            threadId: (msg as any)["X-GM-THRID"] || "",
            from: msg.envelope?.from?.[0]?.address || "",
            to: msg.envelope?.to?.[0]?.address || "",
            subject: msg.envelope?.subject || "",
            date: msg.envelope?.date || new Date(),
            snippet,
            flags: msg.flags || [],
          });

          if (params?.limit && messages.length >= params.limit) {
            break;
          }
        }

        // Group messages by thread ID
        const threadsMap = new Map<string, any[]>();
        for (const msg of messages) {
          if (!threadsMap.has(msg.threadId)) {
            threadsMap.set(msg.threadId, []);
          }
          threadsMap.get(msg.threadId)?.push(msg);
        }

        // Convert to array format
        const threads = Array.from(threadsMap.entries()).map(([threadId, msgs]) => ({
          threadId,
          messages: msgs.sort((a, b) => a.date.getTime() - b.date.getTime()),
        }));

        return threads;
      } finally {
        lock.release();
      }
    } catch (error) {
      console.error("Failed to list threads via IMAP:", error);
      throw new Error(`Failed to list threads via IMAP: ${error}`);
    } finally {
      await client.logout();
    }
  }

  /**
   * Get a specific thread by thread ID
   */
  async getThread(threadId: string) {
    const client = this.createIMAPConnection();

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        const messages: any[] = [];

        // Search for all messages with this thread ID
        for await (const msg of client.fetch(
          { all: true },
          {
            envelope: true,
            flags: true,
            bodyStructure: true,
            uid: true,
            source: true, // Get full message source
            // Gmail-specific extensions (using any to allow these)
            "X-GM-THRID": true,
            "X-GM-MSGID": true,
          } as any
        )) {
          const msgThreadId = (msg as any)["X-GM-THRID"];
          if (msgThreadId === threadId) {
            // Parse the full message
            const body = await this.parseMessageBody(client, msg.uid);

            messages.push({
              uid: msg.uid,
              messageId: msg.envelope?.messageId || "",
              threadId: msgThreadId,
              from: msg.envelope?.from?.[0]?.address || "",
              to: msg.envelope?.to?.map((t) => t.address).join(", ") || "",
              subject: msg.envelope?.subject || "",
              date: msg.envelope?.date || new Date(),
              flags: msg.flags || [],
              body,
            });
          }
        }

        return {
          threadId,
          messages: messages.sort((a, b) => a.date.getTime() - b.date.getTime()),
        };
      } finally {
        lock.release();
      }
    } catch (error) {
      console.error("Failed to get thread via IMAP:", error);
      throw new Error(`Failed to get thread via IMAP: ${error}`);
    } finally {
      await client.logout();
    }
  }

  /**
   * Parse message body from IMAP
   */
  private async parseMessageBody(
    client: ImapFlow,
    uid: number
  ): Promise<{ text?: string; html?: string }> {
    const result: { text?: string; html?: string } = {};

    try {
      // Try to get text part
      const { content: textContent } = await client.download(uid, "TEXT", {
        maxBytes: 1024 * 1024, // 1MB max
      });
      // content is a Readable stream, convert to string
      const chunks: Buffer[] = [];
      for await (const chunk of textContent) {
        chunks.push(Buffer.from(chunk));
      }
      result.text = Buffer.concat(chunks).toString("utf-8");
    } catch (e) {
      // Text part might not exist
    }

    try {
      // Try to get HTML part
      const { content: htmlContent } = await client.download(uid, "1.2", {
        // Common HTML part path
        maxBytes: 1024 * 1024,
      });
      // content is a Readable stream, convert to string
      const chunks: Buffer[] = [];
      for await (const chunk of htmlContent) {
        chunks.push(Buffer.from(chunk));
      }
      result.html = Buffer.concat(chunks).toString("utf-8");
    } catch (e) {
      // HTML part might not exist
    }

    return result;
  }

  /**
   * Setup IMAP IDLE to watch for new emails
   * This provides near real-time notifications
   *
   * @param onNewEmail Callback when new email arrives
   * @returns A function to stop watching
   */
  async watchForNewEmails(
    onNewEmail: (email: {
      uid: number;
      messageId: string;
      threadId: string;
      from: string;
      subject: string;
    }) => Promise<void>
  ): Promise<() => Promise<void>> {
    const client = this.createIMAPConnection();

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    // Listen for new messages
    client.on("exists", async (data) => {
      console.log(`New message detected: ${data.count} messages in mailbox`);

      // Fetch the new message(s)
      try {
        for await (const msg of client.fetch(`${data.count}:*`, {
          envelope: true,
          uid: true,
          // Gmail-specific extension (using any to allow this)
          "X-GM-THRID": true,
        } as any)) {
          await onNewEmail({
            uid: msg.uid,
            messageId: msg.envelope?.messageId || "",
            threadId: (msg as any)["X-GM-THRID"] || "",
            from: msg.envelope?.from?.[0]?.address || "",
            subject: msg.envelope?.subject || "",
          });
        }
      } catch (error) {
        console.error("Error processing new email:", error);
      }
    });

    // Start IDLE mode to wait for new messages
    await client.idle();

    // Return cleanup function
    return async () => {
      lock.release();
      await client.logout();
    };
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.smtpTransporter.verify();
      return true;
    } catch (error) {
      console.error("SMTP verification failed:", error);
      return false;
    }
  }
}

/**
 * Create an SMTP/IMAP service instance from a connection ID
 */
export async function createSMTPIMAPService(connectionId: string) {
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new Error("Gmail connection not found");
  }

  if (connection.connectionType !== "smtp") {
    throw new Error("Connection is not configured for SMTP/IMAP");
  }

  if (!connection.gmailAccessToken) {
    throw new Error("Gmail connection missing access token");
  }

  return new SMTPIMAPService(connection.gmailAccessToken, connection.email);
}
