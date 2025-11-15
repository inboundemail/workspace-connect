/**
 * Type definitions for Workspace Connect SDK
 */

export interface WorkspaceConnectIdentity {
  customerId: string | undefined;
  customerData?: Record<string, unknown>;
}

export interface WorkspaceConnectRequest extends Request {
  headers: Headers;
}

export interface WorkspaceConnectContext {
  identity: WorkspaceConnectIdentity;
  params: Record<string, string | string[]>;
}

export type RouteHandler = (
  request: WorkspaceConnectRequest,
  context: WorkspaceConnectContext
) => Promise<Response>;

export interface RouteDescriptor {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: RouteHandler;
}

export interface WorkspaceProvider {
  name: string;
  routes: RouteDescriptor[];
}

export interface WorkspaceConnectHandlerOptions {
  identify: (request: WorkspaceConnectRequest) => Promise<WorkspaceConnectIdentity>;
  providers: WorkspaceProvider[];
  cronSecret?: string;
}

// Email types
export interface EmailAddress {
  email: string;
  name?: string;
}

export interface SendEmailRequest {
  connection_id: string;
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
    content: string;
    contentType?: string;
  }>;
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
}

// Webhook types
export type WebhookEvent = "email.received" | "email.sent";

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

// Connection types
export interface CreateConnectionRequest {
  user_id: string;
  email: string;
  connection_type: "api";
  start_watching?: boolean;
}

export interface Connection {
  id: string;
  email: string;
  connection_type: "api";
  is_active: boolean;
  last_synced_at?: string;
  watch_expiration?: string;
  created_at: string;
  updated_at: string;
}

// Provider-specific types
export interface GmailProviderOptions {
  projectId: string;
  topicName: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface GmailPubSubMessage {
  message: {
    data: string; // base64 encoded
    messageId: string;
    publishTime: string;
  };
}

export interface GmailNotificationData {
  emailAddress: string;
  historyId: string;
}

