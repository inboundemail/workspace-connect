import { pgTable, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";

// Better Auth tables - these are the core tables needed by better-auth
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Custom tables for Gmail integration
export const gmailConnection = pgTable("gmail_connection", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  connectionType: text("connection_type").notNull(), // 'api' or 'smtp'
  // Gmail API specific
  gmailAccessToken: text("gmail_access_token"),
  gmailRefreshToken: text("gmail_refresh_token"),
  gmailTokenExpiry: timestamp("gmail_token_expiry"),
  gmailHistoryId: text("gmail_history_id"), // For tracking changes via Gmail API
  gmailPubsubTopic: text("gmail_pubsub_topic"),
  gmailWatchExpiration: timestamp("gmail_watch_expiration"),
  // IMAP/SMTP specific
  imapHost: text("imap_host"),
  imapPort: integer("imap_port"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  // Common
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const webhook = pgTable("webhook", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  gmailConnectionId: text("gmail_connection_id")
    .notNull()
    .references(() => gmailConnection.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret"),
  isActive: boolean("is_active").notNull().default(true),
  events: jsonb("events").notNull(), // ['email.received', 'email.sent', etc.]
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const emailLog = pgTable("email_log", {
  id: text("id").primaryKey(),
  gmailConnectionId: text("gmail_connection_id")
    .notNull()
    .references(() => gmailConnection.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(), // Gmail message ID or SMTP message ID
  threadId: text("thread_id"), // Gmail thread ID
  from: text("from").notNull(),
  to: jsonb("to").notNull(), // array of recipients
  subject: text("subject"),
  snippet: text("snippet"), // preview text
  direction: text("direction").notNull(), // 'inbound' or 'outbound'
  status: text("status").notNull(), // 'received', 'sent', 'failed', etc.
  rawPayload: jsonb("raw_payload"), // store full email data
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const parsedEmails = pgTable("parsed_emails", {
  id: text("id").primaryKey(),
  gmailConnectionId: text("gmail_connection_id")
    .notNull()
    .references(() => gmailConnection.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().unique(), // Gmail message ID - unique to prevent duplicates
  threadId: text("thread_id"), // Gmail thread ID
  from: text("from").notNull(),
  to: jsonb("to").notNull(), // array of recipient email addresses
  rawEmail: jsonb("raw_email").notNull(), // full raw email payload
  html: text("html"), // HTML content
  text: text("text"), // plain text content
  attachments: jsonb("attachments"), // array of attachment objects: [{ filename, contentType, size, attachmentId }]
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
