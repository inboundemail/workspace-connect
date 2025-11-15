import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * /api/api-keys endpoint
 *
 * Manage API keys for service-to-service authentication.
 *
 * POST: Create a new API key
 * GET: List API keys for the current user
 * DELETE: Revoke an API key
 */

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, expiresIn } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Create API key via better-auth
    const apiKey = await auth.api.createApiKey({
      body: {
        name,
        expiresIn, // Optional: duration in seconds
      },
      headers: headersList,
    });

    return NextResponse.json({
      id: apiKey.id,
      name: apiKey.name,
      key: apiKey.key, // Only returned on creation
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create API key",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKeys = await auth.api.listApiKeys({
      headers: headersList,
    });

    return NextResponse.json({
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        start: (key as any).start, // First few characters of the key
        prefix: (key as any).prefix, // API key prefix
        // key field is not returned for security
      })),
    });
  } catch (error) {
    console.error("Error listing API keys:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list API keys",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get("id");

    if (!keyId) {
      return NextResponse.json(
        { error: "API key ID is required" },
        { status: 400 }
      );
    }

    await auth.api.deleteApiKey({
      body: {
        keyId: keyId,
      },
      headers: headersList,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting API key:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete API key",
      },
      { status: 500 }
    );
  }
}
