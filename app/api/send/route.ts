import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gmailConnection, emailLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createGmailAPIService } from "@/lib/services/gmail-api";
import { createSMTPIMAPService } from "@/lib/services/smtp-imap";

/**
 * /api/send endpoint
 *
 * This endpoint matches the Resend API specification:
 * https://resend.com/docs/api-reference/emails/send-email
 *
 * It supports both Gmail API and SMTP approaches based on the connection type.
 */

// Resend-compatible request schema
const sendEmailSchema = z.object({
  from: z.string().email(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string(),
  html: z.string().optional(),
  text: z.string().optional(),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  reply_to: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.string(), // Base64 encoded
        contentType: z.string().optional(),
      })
    )
    .optional(),
  // Threading support (not in standard Resend but useful for Gmail)
  in_reply_to: z.string().optional(),
  references: z.array(z.string()).optional(),
  thread_id: z.string().optional(),
  // Connection configuration
  connection_id: z.string(), // Which Gmail connection to use
  method: z.enum(["api", "smtp"]).optional(), // Force a specific method
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = sendEmailSchema.parse(body);

    // Get the Gmail connection
    const [connection] = await db
      .select()
      .from(gmailConnection)
      .where(eq(gmailConnection.id, data.connection_id))
      .limit(1);

    if (!connection) {
      return NextResponse.json(
        { error: "Gmail connection not found" },
        { status: 404 }
      );
    }

    if (!connection.isActive) {
      return NextResponse.json(
        { error: "Gmail connection is not active" },
        { status: 400 }
      );
    }

    // Determine which method to use
    const method = data.method || connection.connectionType;

    let result: any;
    let messageId: string;
    let threadId: string | undefined;

    if (method === "api") {
      // Use Gmail API
      const service = await createGmailAPIService(data.connection_id);

      // Convert attachments from base64 if provided
      const attachments = data.attachments?.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, "base64"),
        contentType: att.contentType,
      }));

      result = await service.sendEmail({
        from: data.from,
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
        cc: data.cc,
        bcc: data.bcc,
        reply_to: data.reply_to,
        attachments,
        in_reply_to: data.in_reply_to,
        references: data.references,
        thread_id: data.thread_id,
      });

      messageId = result.id || "";
      threadId = result.threadId || undefined;
    } else {
      // Use SMTP
      const service = await createSMTPIMAPService(data.connection_id);

      // Convert attachments from base64 if provided
      const attachments = data.attachments?.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, "base64"),
        contentType: att.contentType,
      }));

      result = await service.sendEmail({
        from: data.from,
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
        cc: data.cc,
        bcc: data.bcc,
        reply_to: data.reply_to,
        attachments,
        inReplyTo: data.in_reply_to,
        references: data.references,
      });

      messageId = result.id || "";
    }

    // Log the email
    await db.insert(emailLog).values({
      id: crypto.randomUUID(),
      gmailConnectionId: data.connection_id,
      messageId,
      threadId,
      from: data.from,
      to: Array.isArray(data.to) ? data.to : [data.to],
      subject: data.subject,
      snippet: data.text?.substring(0, 150) || data.html?.substring(0, 150) || "",
      direction: "outbound",
      status: "sent",
      rawPayload: result,
      createdAt: new Date(),
    });

    // Return Resend-compatible response
    return NextResponse.json(
      {
        id: messageId,
        from: data.from,
        to: data.to,
        created_at: new Date().toISOString(),
        // Additional Gmail-specific data
        thread_id: threadId,
        method,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending email:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
