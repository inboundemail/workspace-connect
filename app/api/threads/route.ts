import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gmailConnection } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createGmailAPIService, GmailAPIService } from "@/lib/services/gmail-api";

/**
 * /api/threads endpoint
 *
 * List email threads from a Gmail connection using Gmail API.
 *
 * Query parameters:
 * - connection_id: Gmail connection ID (required)
 * - limit: Number of threads to return (default: 50)
 * - page_token: Pagination token
 * - q: Search query
 * - label: Label/folder to search (default: INBOX)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get("connection_id");
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

    if (connection.connectionType !== "api") {
      return NextResponse.json(
        { error: "Connection is not configured for Gmail API" },
        { status: 400 }
      );
    }

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
    });
  } catch (error) {
    console.error("Error listing threads:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list threads" },
      { status: 500 }
    );
  }
}
