import crypto from "crypto";

/**
 * Create a webhook signature using HMAC SHA256
 */
export function createWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify a webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = createWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Parse email address string to extract email and name
 * Format: "Name <email@example.com>" or "email@example.com"
 */
export function parseEmailAddress(
  address: string
): { email: string; name?: string } {
  const match = address.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || undefined,
      email: match[2].trim(),
    };
  }
  return { email: address.trim() };
}

/**
 * Parse multiple email addresses
 */
export function parseEmailAddresses(
  addresses: string | string[]
): Array<{ email: string; name?: string }> {
  const addrs = Array.isArray(addresses) ? addresses : [addresses];
  return addrs
    .flatMap((addr) => addr.split(","))
    .map((addr) => parseEmailAddress(addr.trim()));
}

/**
 * JSON response helper
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Error response helper
 */
export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

