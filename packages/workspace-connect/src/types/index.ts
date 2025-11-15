/**
 * Type definitions for Workspace Connect SDK
 */

// Gmail Watch Types
export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
}

export interface WatchInfo {
  email: string;
  watchId?: string;
  expiration: Date;
  historyId: string;
}

export interface EmailNotification {
  emailAddress: string;
  historyId: string;
}

// Configuration
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  pubSubProjectId: string;
  pubSubTopicName?: string; // defaults to 'gmail-notifications'
}

// Handler Options
export interface WorkspaceConnectHandlerOptions {
  google: GoogleConfig;
  cronSecret: string;
  
  // Token lookup - user provides
  getTokens: (email: string) => Promise<GoogleTokens>;
  
  // Event callbacks
  onWatchStarted: (watch: WatchInfo) => Promise<void>;
  onWatchStopped: (params: { email: string }) => Promise<void>;
  onEmailReceived: (notification: EmailNotification) => Promise<void>;
  
  // Cron refresh
  getExpiringWatches: () => Promise<Array<{ email: string }>>;
  onWatchRefreshed: (params: { email: string; newExpiration: Date }) => Promise<void>;
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

