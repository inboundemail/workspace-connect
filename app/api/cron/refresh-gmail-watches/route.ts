import { NextRequest, NextResponse } from "next/server";
import { refreshGmailAPIWatches } from "@/lib/services/email-watcher";

/**
 * /api/cron/refresh-gmail-watches endpoint
 *
 * This endpoint is called by Vercel Cron Jobs to refresh Gmail API watches.
 * Gmail watches expire after 7 days, so this should run daily to keep them active.
 *
 * Configured in vercel.json to run daily at 2 AM UTC.
 *
 * Security: Requires CRON_SECRET in Authorization header to prevent unauthorized access.
 * Set CRON_SECRET in your Vercel project environment variables.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify the request is authorized
    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response("Unauthorized", {
        status: 401,
      });
    }

    console.log("Starting Gmail API watch refresh cron job");

    await refreshGmailAPIWatches();

    return NextResponse.json({
      success: true,
      message: "Gmail API watches refreshed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error refreshing Gmail API watches:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

