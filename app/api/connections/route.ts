import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gmailConnection, account } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { startWatching, stopWatching } from "@/lib/services/email-watcher";

/**
 * /api/connections endpoint
 *
 * Manage Gmail connections.
 *
 * POST: Create a new Gmail connection from an authenticated account
 * GET: List Gmail connections for the current user
 */

const createConnectionSchema = z.object({
  user_id: z.string(),
  email: z.string().email(),
  connection_type: z.enum(["api", "smtp"]),
  // For IMAP/SMTP
  imap_host: z.string().optional(),
  imap_port: z.number().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.number().optional(),
  // Start watching immediately?
  start_watching: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createConnectionSchema.parse(body);

    // Get the user's Google account to extract tokens
    const [googleAccount] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, data.user_id),
          eq(account.providerId, "google")
        )
      )
      .limit(1);

    if (!googleAccount) {
      return NextResponse.json(
        { error: "No Google account found for this user" },
        { status: 404 }
      );
    }

    if (!googleAccount.accessToken || !googleAccount.refreshToken) {
      return NextResponse.json(
        { error: "Google account missing tokens" },
        { status: 400 }
      );
    }

    // Create the Gmail connection
    const [newConnection] = await db
      .insert(gmailConnection)
      .values({
        id: crypto.randomUUID(),
        userId: data.user_id,
        email: data.email,
        connectionType: data.connection_type,
        gmailAccessToken: googleAccount.accessToken,
        gmailRefreshToken: googleAccount.refreshToken,
        gmailTokenExpiry: googleAccount.accessTokenExpiresAt,
        imapHost: data.imap_host || process.env.GMAIL_IMAP_HOST || "imap.gmail.com",
        imapPort: data.imap_port || parseInt(process.env.GMAIL_IMAP_PORT || "993"),
        smtpHost: data.smtp_host || process.env.GMAIL_SMTP_HOST || "smtp.gmail.com",
        smtpPort: data.smtp_port || parseInt(process.env.GMAIL_SMTP_PORT || "587"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Start watching for new emails if requested
    if (data.start_watching) {
      try {
        await startWatching(newConnection.id);
      } catch (error) {
        console.error("Failed to start watching:", error);
        // Don't fail the request if watching fails
      }
    }

    return NextResponse.json(
      {
        id: newConnection.id,
        email: newConnection.email,
        connection_type: newConnection.connectionType,
        is_active: newConnection.isActive,
        created_at: newConnection.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating connection:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create connection",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    // Get all connections for this user
    const connections = await db
      .select()
      .from(gmailConnection)
      .where(eq(gmailConnection.userId, userId));

    return NextResponse.json({
      connections: connections.map((conn) => ({
        id: conn.id,
        email: conn.email,
        connection_type: conn.connectionType,
        is_active: conn.isActive,
        last_synced_at: conn.lastSyncedAt,
        watch_expiration: conn.gmailWatchExpiration,
        created_at: conn.createdAt,
        updated_at: conn.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error listing connections:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list connections",
      },
      { status: 500 }
    );
  }
}
