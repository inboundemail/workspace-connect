/**
 * Utility functions for Workspace Connect
 */

import type {
  SendEmailRequest,
  SendEmailResponse,
  Thread,
  ThreadsResponse,
  ThreadDetailResponse,
  CreateConnectionRequest,
  Connection,
  CreateWebhookRequest,
  Webhook,
  ErrorResponse,
} from "./types";

/**
 * API Client for Workspace Connect
 */
export class WorkspaceConnectClient {
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:3000") {
    this.baseUrl = baseUrl;
  }

  /**
   * Send an email
   */
  async sendEmail(data: SendEmailRequest): Promise<SendEmailResponse> {
    const response = await fetch(`${this.baseUrl}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  }

  /**
   * List threads
   */
  async listThreads(params: {
    connection_id: string;
    method?: "api" | "smtp";
    limit?: number;
    page_token?: string;
    q?: string;
    label?: string;
  }): Promise<ThreadsResponse> {
    const url = new URL(`${this.baseUrl}/api/threads`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  }

  /**
   * Get a specific thread
   */
  async getThread(
    threadId: string,
    connectionId: string,
    method?: "api" | "smtp"
  ): Promise<ThreadDetailResponse> {
    const url = new URL(`${this.baseUrl}/api/thread/${threadId}`);
    url.searchParams.set("connection_id", connectionId);
    if (method) {
      url.searchParams.set("method", method);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  }

  /**
   * Create a Gmail connection
   */
  async createConnection(data: CreateConnectionRequest): Promise<Connection> {
    const response = await fetch(`${this.baseUrl}/api/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  }

  /**
   * List connections for a user
   */
  async listConnections(userId: string): Promise<Connection[]> {
    const response = await fetch(
      `${this.baseUrl}/api/connections?user_id=${userId}`
    );

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    return data.connections;
  }

  /**
   * Create a webhook
   */
  async createWebhook(data: CreateWebhookRequest): Promise<Webhook> {
    const response = await fetch(`${this.baseUrl}/api/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  }

  /**
   * List webhooks for a connection
   */
  async listWebhooks(connectionId: string): Promise<Webhook[]> {
    const response = await fetch(
      `${this.baseUrl}/api/webhooks?connection_id=${connectionId}`
    );

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    return data.webhooks;
  }

  /**
   * Get all threads (paginate automatically)
   */
  async getAllThreads(
    connectionId: string,
    method?: "api" | "smtp"
  ): Promise<Thread[]> {
    const allThreads: Thread[] = [];
    let pageToken: string | undefined;

    do {
      const result = await this.listThreads({
        connection_id: connectionId,
        method,
        limit: 100,
        page_token: pageToken,
      });

      allThreads.push(...result.threads);
      pageToken = result.next_page_token;
    } while (pageToken);

    return allThreads;
  }
}

/**
 * Format email address for display
 */
export function formatEmailAddress(address: {
  email: string;
  name?: string;
}): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

/**
 * Parse email address from string
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
 * Convert file to base64 string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}

/**
 * Verify webhook signature
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // For Node.js environments
  if (typeof window === "undefined") {
    const crypto = await import("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // For browser environments (using Web Crypto API)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const dataBuffer = encoder.encode(payload);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, dataBuffer);
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature === expectedSignature;
}

/**
 * Extract plain text from HTML
 */
export function htmlToText(html: string): string {
  // Simple HTML to text conversion
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, "")
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Generate a random ID
 */
export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, i)));
      }
    }
  }

  throw lastError!;
}

/**
 * Rate limiter utility
 */
export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;

  constructor(
    private maxConcurrent: number,
    private minDelayMs: number = 0
  ) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const fn = this.queue.shift();
    if (!fn) return;

    this.running++;

    try {
      await fn();
    } finally {
      this.running--;
      if (this.minDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.minDelayMs));
      }
      this.process();
    }
  }
}
