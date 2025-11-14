import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gmailConnection } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createGmailAPIService, GmailAPIService } from "@/lib/services/gmail-api";
import { createSMTPIMAPService } from "@/lib/services/smtp-imap";

/**
 * /api/thread/[id] endpoint
 *
 * Get a specific email thread by ID.
 * Supports both Gmail API and SMTP/IMAP approaches.
 *
 * Query parameters:
 * - connection_id: Gmail connection ID (required)
 * - method: 'api' or 'smtp' (optional, defaults to connection type)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: threadId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get("connection_id");
    const method = searchParams.get("method") as "api" | "smtp" | null;

    if (!connectionId) {
      return NextResponse.json(
        { error: "connection_id is required" },
        { status: 400 }
      );
    }

    // Get the Gmail connection
    const [connection] = await db
      .select()
      .from(gmailConnection)
      .where(eq(gmailConnection.id, connectionId))
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
    const useMethod = method || connection.connectionType;

    if (useMethod === "api") {
      // Use Gmail API
      const service = await createGmailAPIService(connectionId);

      const thread = await service.getThread(threadId);

      // Parse all messages in the thread
      const messages = (thread.messages || []).map((msg: any) => {
        const parsed = GmailAPIService.parseMessage(msg);
        return {
          id: parsed.id,
          threadId: parsed.threadId,
          labelIds: parsed.labelIds,
          snippet: parsed.snippet,
          from: parsed.from,
          to: parsed.to,
          subject: parsed.subject,
          date: parsed.date,
          messageId: parsed.messageId,
          inReplyTo: parsed.inReplyTo,
          references: parsed.references,
          body: parsed.body,
        };
      });

      return NextResponse.json({
        id: thread.id,
        historyId: thread.historyId,
        messages,
        method: "api",
      });
    } else {
      // Use SMTP/IMAP
      const service = await createSMTPIMAPService(connectionId);

      const thread = await service.getThread(threadId);

      // Format to match API response
      const messages = thread.messages.map((msg) => ({
        id: msg.messageId,
        threadId: msg.threadId,
        uid: msg.uid,
        snippet: "",
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        date: msg.date.toISOString(),
        messageId: msg.messageId,
        flags: msg.flags,
        body: msg.body,
      }));

      return NextResponse.json({
        id: thread.threadId,
        messages,
        method: "smtp",
      });
    }
  } catch (error) {
    console.error("Error getting thread:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get thread" },
      { status: 500 }
    );
  }
}
