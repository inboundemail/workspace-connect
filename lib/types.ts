/**
 * Type definitions for Workspace Connect
 */

// Resend-compatible email types
export interface EmailAddress {
  email: string;
  name?: string;
}

export interface SendEmailRequest {
  connection_id: string;
  method?: "api" | "smtp";
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  reply_to?: string | string[];
  attachments?: Array<{
    filename: string;
    content: string; // Base64 encoded
    contentType?: string;
  }>;
  // Threading
  in_reply_to?: string;
  references?: string[];
  thread_id?: string;
}

export interface SendEmailResponse {
  id: string;
  from: string;
  to: string | string[];
  created_at: string;
  thread_id?: string;
  method: "api" | "smtp";
}

// Thread types
export interface Thread {
  id: string;
  snippet: string;
  messageCount: number;
  subject: string;
  from: string;
  date: string;
  preview: string;
  historyId?: string;
}

export interface ThreadsResponse {
  threads: Thread[];
  next_page_token?: string;
  result_size_estimate?: number;
  method: "api" | "smtp";
}

export interface Message {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: {
    text?: string;
    html?: string;
  };
  messageId: string;
  inReplyTo?: string;
  references?: string;
  snippet?: string;
  labelIds?: string[];
  flags?: string[];
  uid?: number;
}

export interface ThreadDetailResponse {
  id: string;
  historyId?: string;
  messages: Message[];
  method: "api" | "smtp";
}

// Connection types
export interface CreateConnectionRequest {
  user_id: string;
  email: string;
  connection_type: "api" | "smtp";
  imap_host?: string;
  imap_port?: number;
  smtp_host?: string;
  smtp_port?: number;
  start_watching?: boolean;
}

export interface Connection {
  id: string;
  email: string;
  connection_type: "api" | "smtp";
  is_active: boolean;
  last_synced_at?: string;
  watch_expiration?: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionsResponse {
  connections: Connection[];
}

// Webhook types
export type WebhookEvent = "email.received" | "email.sent";

export interface CreateWebhookRequest {
  connection_id: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  is_active?: boolean;
}

export interface Webhook {
  id: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface WebhooksResponse {
  webhooks: Webhook[];
}

// Webhook payload (inbound.new format)
export interface WebhookPayload {
  type: WebhookEvent;
  id: string;
  timestamp: string;
  data: {
    id: string;
    from: EmailAddress;
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    subject: string;
    text?: string;
    html?: string;
    snippet?: string;
    thread_id?: string;
    in_reply_to?: string;
    references?: string[];
    attachments?: Array<{
      filename: string;
      contentType: string;
      size: number;
    }>;
    headers?: Record<string, string>;
  };
}

// Error response
export interface ErrorResponse {
  error: string;
  details?: any;
}
