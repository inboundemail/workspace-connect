import { NextRequest, NextResponse } from "next/server";
import { handleGmailPubSubNotification } from "@/lib/services/gmail-notification-handler";

/**
 * /api/webhooks/gmail-pubsub endpoint (LEGACY)
 *
 * @deprecated Use /api/workspace-connect/providers/gmail instead
 * 
 * This is a thin wrapper for backward compatibility.
 * All logic has been moved to the Workspace Connect SDK handler.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle Pub/Sub format
    if (body.message?.data) {
      const decoded = JSON.parse(
        Buffer.from(body.message.data, "base64").toString("utf-8")
      );
      const { emailAddress, historyId } = decoded;
      
      await handleGmailPubSubNotification(emailAddress, historyId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  } catch (error) {
    console.error("Error processing Gmail push notification:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process notification" },
      { status: 500 }
    );
  }
}
