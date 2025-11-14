import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gmailConnection } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createGmailAPIService, GmailAPIService } from "@/lib/services/gmail-api";
import { createSMTPIMAPService } from "@/lib/services/smtp-imap";

/**
 * /api/threads endpoint
 *
 * List email threads from a Gmail connection.
 * Supports both Gmail API and SMTP/IMAP approaches.
 *
 * Query parameters:
 * - connection_id: Gmail connection ID (required)
 * - method: 'api' or 'smtp' (optional, defaults to connection type)
 * - limit: Number of threads to return (default: 50)
 * - page_token: Pagination token (Gmail API only)
 * - q: Search query (Gmail API only)
 * - label: Label/folder to search (default: INBOX)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get("connection_id");
    const method = searchParams.get("method") as "api" | "smtp" | null;
    const limit = parseInt(searchParams.get("limit") || "50");
    const pageToken = searchParams.get("page_token");
    const query = searchParams.get("q");
    const label = searchParams.get("label") || "INBOX";

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

      const result = await service.listThreads({
        maxResults: limit,
        pageToken: pageToken || undefined,
        q: query || undefined,
        labelIds: [label],
      });

      // Parse the threads to extract basic info
      const threads = await Promise.all(
        (result.threads || []).map(async (thread: any) => {
          try {
            const fullThread = await service.getThread(thread.id);
            const firstMessage = fullThread.messages?.[0];
            const parsed = firstMessage
              ? GmailAPIService.parseMessage(firstMessage)
              : null;

            return {
              id: thread.id,
              snippet: thread.snippet,
              historyId: thread.historyId,
              messageCount: fullThread.messages?.length || 0,
              // First message details
              subject: parsed?.subject || "",
              from: parsed?.from || "",
              date: parsed?.date || "",
              preview: parsed?.snippet || thread.snippet || "",
            };
          } catch (e) {
            console.error(`Failed to fetch thread ${thread.id}:`, e);
            return {
              id: thread.id,
              snippet: thread.snippet || "",
              historyId: thread.historyId,
              messageCount: 0,
              subject: "",
              from: "",
              date: "",
              preview: thread.snippet || "",
            };
          }
        })
      );

      return NextResponse.json({
        threads,
        next_page_token: result.nextPageToken,
        result_size_estimate: result.resultSizeEstimate,
        method: "api",
      });
    } else {
      // Use SMTP/IMAP
      const service = await createSMTPIMAPService(connectionId);

      const threads = await service.listThreads({
        limit,
        seen: undefined, // Get all messages
      });

      // Format to match API response
      const formattedThreads = threads.map((thread) => {
        const firstMsg = thread.messages[0];
        const lastMsg = thread.messages[thread.messages.length - 1];

        return {
          id: thread.threadId,
          snippet: lastMsg.snippet,
          messageCount: thread.messages.length,
          subject: firstMsg.subject,
          from: firstMsg.from,
          date: lastMsg.date.toISOString(),
          preview: lastMsg.snippet,
        };
      });

      return NextResponse.json({
        threads: formattedThreads,
        method: "smtp",
        // Note: IMAP doesn't support pagination tokens like Gmail API
      });
    }
  } catch (error) {
    console.error("Error listing threads:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list threads" },
      { status: 500 }
    );
  }
}
