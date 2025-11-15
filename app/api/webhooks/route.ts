import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { webhook, gmailConnection } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

/**
 * /api/webhooks endpoint
 *
 * Manage webhook configurations for Gmail connections.
 *
 * POST: Create a new webhook
 * GET: List webhooks for a connection
 */

const createWebhookSchema = z.object({
  connection_id: z.string(),
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.enum(["email.received", "email.sent"])),
  is_active: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createWebhookSchema.parse(body);

    // Verify connection exists
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

    // Generate a secret if not provided
    const secret = data.secret || crypto.randomBytes(32).toString("hex");

    // Create webhook
    const [newWebhook] = await db
      .insert(webhook)
      .values({
        id: crypto.randomUUID(),
        userId: connection.userId,
        gmailConnectionId: data.connection_id,
        url: data.url,
        secret,
        events: data.events,
        isActive: data.is_active,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json(
      {
        id: newWebhook.id,
        url: newWebhook.url,
        secret: newWebhook.secret,
        events: newWebhook.events,
        is_active: newWebhook.isActive,
        created_at: newWebhook.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating webhook:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create webhook" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get("connection_id");

    if (!connectionId) {
      return NextResponse.json(
        { error: "connection_id is required" },
        { status: 400 }
      );
    }

    // Get all webhooks for this connection
    const webhooks = await db
      .select()
      .from(webhook)
      .where(eq(webhook.gmailConnectionId, connectionId));

    return NextResponse.json({
      webhooks: webhooks.map((wh) => ({
        id: wh.id,
        url: wh.url,
        events: wh.events,
        is_active: wh.isActive,
        created_at: wh.createdAt,
        updated_at: wh.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error listing webhooks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list webhooks" },
      { status: 500 }
    );
  }
}
