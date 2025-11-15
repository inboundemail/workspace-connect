# Workspace Connect - Gmail API & SMTP Integration

An experimental project to compare Gmail API and SMTP/IMAP implementations for email integration.

## Overview

This project provides a unified API wrapper for Gmail that supports both:
1. **Gmail API** - Google's official REST API with push notifications via Cloud Pub/Sub
2. **SMTP/IMAP** - Standard email protocols with OAuth2 authentication

The API mimics the Resend API format for easy compatibility, with webhook support matching the inbound.new specification.

## Architecture

### Tech Stack

- **Next.js 16** (App Router)
- **Better Auth** - Authentication with Google OAuth
- **Drizzle ORM** - Database management
- **Neon Postgres** - Serverless PostgreSQL
- **Google APIs** - Gmail API client
- **Nodemailer** - SMTP email sending
- **ImapFlow** - Modern IMAP client with IDLE support

### Database Schema

The project uses the following tables:

- `user`, `session`, `account`, `verification` - Better Auth tables
- `gmail_connection` - Stores Gmail connection details and tokens
- `webhook` - Webhook configurations for email notifications
- `email_log` - Logs all sent and received emails

## API Endpoints

### Authentication

```
GET/POST /api/auth/[...all]
```

Better Auth endpoints for Google OAuth. Requests the following Gmail scopes:
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.labels`

### Connections

```
POST /api/connections
GET /api/connections?user_id={userId}
```

Create and manage Gmail connections.

**POST Body:**
```json
{
  "user_id": "user_123",
  "email": "user@gmail.com",
  "connection_type": "api|smtp",
  "start_watching": true
}
```

### Send Email (Resend-Compatible)

```
POST /api/send
```

Send an email via Gmail API or SMTP.

**Request Body:**
```json
{
  "connection_id": "conn_123",
  "method": "api|smtp",
  "from": "sender@gmail.com",
  "to": ["recipient@example.com"],
  "subject": "Hello World",
  "html": "<p>Hello!</p>",
  "text": "Hello!",
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "reply_to": ["reply@example.com"],
  "thread_id": "thread_abc123",
  "in_reply_to": "<message-id>",
  "references": ["<message-id>"],
  "attachments": [
    {
      "filename": "file.pdf",
      "content": "base64-encoded-content",
      "contentType": "application/pdf"
    }
  ]
}
```

**Response:**
```json
{
  "id": "msg_123",
  "from": "sender@gmail.com",
  "to": ["recipient@example.com"],
  "created_at": "2024-01-01T00:00:00.000Z",
  "thread_id": "thread_abc123",
  "method": "api"
}
```

### List Threads

```
GET /api/threads?connection_id={id}&method={api|smtp}&limit={50}&page_token={token}&q={query}&label={INBOX}
```

List email threads from a Gmail connection.

**Response:**
```json
{
  "threads": [
    {
      "id": "thread_123",
      "snippet": "Email preview...",
      "messageCount": 3,
      "subject": "Email Subject",
      "from": "sender@gmail.com",
      "date": "2024-01-01T00:00:00.000Z",
      "preview": "Email preview..."
    }
  ],
  "next_page_token": "token_abc",
  "result_size_estimate": 42,
  "method": "api"
}
```

### Get Thread

```
GET /api/thread/{id}?connection_id={id}&method={api|smtp}
```

Get a specific email thread with all messages.

**Response:**
```json
{
  "id": "thread_123",
  "historyId": "1234567890",
  "messages": [
    {
      "id": "msg_123",
      "threadId": "thread_123",
      "from": "sender@gmail.com",
      "to": "recipient@gmail.com",
      "subject": "Email Subject",
      "date": "2024-01-01T00:00:00.000Z",
      "body": {
        "text": "Plain text body",
        "html": "<p>HTML body</p>"
      },
      "messageId": "<message-id>",
      "inReplyTo": "<previous-message-id>",
      "references": "<message-id>"
    }
  ],
  "method": "api"
}
```

### Webhooks

```
POST /api/webhooks
GET /api/webhooks?connection_id={id}
```

Create and manage webhooks for email notifications.

**POST Body:**
```json
{
  "connection_id": "conn_123",
  "url": "https://your-app.com/webhook",
  "secret": "optional-webhook-secret",
  "events": ["email.received", "email.sent"],
  "is_active": true
}
```

**Webhook Payload (inbound.new format):**
```json
{
  "type": "email.received",
  "id": "evt_123",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "data": {
    "id": "msg_123",
    "from": {
      "email": "sender@example.com",
      "name": "Sender Name"
    },
    "to": [
      {
        "email": "recipient@example.com",
        "name": "Recipient Name"
      }
    ],
    "subject": "Email Subject",
    "text": "Plain text body",
    "html": "<p>HTML body</p>",
    "snippet": "Preview text...",
    "thread_id": "thread_123",
    "in_reply_to": "<message-id>",
    "references": ["<message-id>"],
    "headers": {
      "message-id": "<msg-id>",
      "date": "Thu, 01 Jan 2024 00:00:00 +0000"
    }
  }
}
```

### Gmail Push Notifications Handler

```
POST /api/webhooks/gmail-pubsub
```

Receives push notifications from Google Cloud Pub/Sub when new emails arrive (Gmail API only).

## Gmail API vs SMTP/IMAP Comparison

### Gmail API Approach

**Pros:**
- ✅ **Native Gmail features**: Full access to labels, threads, search, etc.
- ✅ **Efficient**: Request only the fields you need, server-side processing
- ✅ **Real-time push notifications**: Via Cloud Pub/Sub (near-instant)
- ✅ **Better alias support**: Properly handles send-as aliases with DKIM/SPF
- ✅ **History API**: Efficient syncing with historyId
- ✅ **No duplicate data**: Messages with multiple labels fetched once
- ✅ **Built-in threading**: Threads are first-class resources

**Cons:**
- ❌ **Complex setup**: Requires Cloud Pub/Sub configuration
- ❌ **Watch management**: Must renew watches every 7 days
- ❌ **Google-specific**: Only works with Gmail/Google Workspace
- ❌ **API quotas**: Subject to Google's rate limits
- ❌ **Security review**: May require Google's security assessment for production
- ❌ **Initial learning curve**: Different paradigm from traditional email protocols

**Best For:**
- Gmail-specific integrations
- Applications needing advanced Gmail features
- Real-time email notifications at scale
- Professional/production deployments

### SMTP/IMAP Approach

**Pros:**
- ✅ **Universal**: Works with Gmail, Outlook, Yahoo, any IMAP/SMTP provider
- ✅ **Simpler setup**: No Cloud Pub/Sub required
- ✅ **Standard protocols**: Well-documented, mature ecosystem
- ✅ **IDLE support**: Real-time notifications via IMAP IDLE
- ✅ **No API quotas**: Not subject to Google's API limits
- ✅ **Easier to test**: Can use standard email clients for debugging

**Cons:**
- ❌ **Less efficient**: May transfer more data than needed
- ❌ **Limited features**: No Gmail-specific features like labels
- ❌ **Connection management**: Need to maintain open IMAP connections for IDLE
- ❌ **Folder duplication**: Messages in multiple folders downloaded multiple times
- ❌ **Manual threading**: Must parse X-GM-THRID extension for Gmail
- ❌ **Alias complications**: May fail DKIM/SPF checks, appear as "via gmail.com"
- ❌ **Stateful**: IMAP connections need reconnection handling

**Best For:**
- Multi-provider email integration
- Simple send/receive use cases
- Applications avoiding Google's API policies
- Quick prototypes and experiments

## Implementation Details

### Gmail API: Push Notifications Flow

1. **Setup Watch**: Call `users.watch` to subscribe to mailbox changes
2. **Pub/Sub Configuration**:
   - Create a Cloud Pub/Sub topic
   - Grant Gmail permission to publish to it
   - Create a push subscription pointing to `/api/webhooks/gmail-pubsub`
3. **Receive Notification**: Gmail publishes to Pub/Sub when changes occur
4. **Process Changes**: Use History API to get new messages since last historyId
5. **Trigger Webhooks**: Send email data to configured webhook URLs
6. **Renew Watch**: Refresh the watch every 24 hours (expires after 7 days)

### SMTP/IMAP: IDLE Flow

1. **Connect**: Establish IMAP connection with OAuth2
2. **IDLE Mode**: Issue IMAP IDLE command to wait for new messages
3. **Notification**: Server notifies when new message arrives
4. **Fetch Message**: Retrieve full message details
5. **Parse**: Extract headers, body, and Gmail extensions (X-GM-THRID)
6. **Trigger Webhooks**: Send email data to configured webhook URLs
7. **Reconnect**: Handle connection drops and reconnect

### Threading Support

**Gmail API:**
- Native thread support via `threadId`
- Use `threads.get` to retrieve full conversation
- Specify `threadId` when sending replies

**SMTP/IMAP:**
- Use Gmail's `X-GM-THRID` extension to group messages
- Include `In-Reply-To` and `References` headers when replying
- Match subject line for Gmail's threading logic

### Authentication

Both approaches use **OAuth2** for authentication:

1. User signs in with Google via Better Auth
2. Access token and refresh token are stored in database
3. Gmail API: Tokens used directly with Google APIs client
4. SMTP/IMAP: Tokens used with XOAUTH2 SASL mechanism

## Setup Instructions

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Database
DATABASE_URL=postgresql://...

# Better Auth
BETTER_AUTH_SECRET=your-secret
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Gmail API (optional)
GOOGLE_CLOUD_PROJECT_ID=...
GOOGLE_PUBSUB_TOPIC=gmail-notifications
```

### 2. Google Cloud Setup

#### For Gmail API:

1. Create a Google Cloud project
2. Enable Gmail API
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. For push notifications:
   - Create a Pub/Sub topic
   - Grant `gmail-api-push@system.gserviceaccount.com` the "Pub/Sub Publisher" role
   - Create a push subscription to `/api/webhooks/gmail-pubsub`

#### For SMTP/IMAP:

1. Create a Google Cloud project
2. Create OAuth 2.0 credentials (same as above)
3. No additional setup needed (Gmail's SMTP/IMAP are always available)

### 3. Database Setup

```bash
npm run db:generate  # Generate migrations
npm run db:push      # Push to database
```

### 4. Run Development Server

```bash
npm run dev
```

## Usage Examples

### Create a Connection

```typescript
// After user authenticates with Google
const response = await fetch('/api/connections', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user_123',
    email: 'user@gmail.com',
    connection_type: 'api', // or 'smtp'
    start_watching: true
  })
});

const { id } = await response.json();
```

### Send an Email

```typescript
await fetch('/api/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    connection_id: 'conn_123',
    method: 'api', // Force Gmail API
    from: 'user@gmail.com',
    to: ['recipient@example.com'],
    subject: 'Hello from Workspace Connect',
    html: '<p>Testing Gmail API integration</p>'
  })
});
```

### List Threads

```typescript
const response = await fetch(
  '/api/threads?connection_id=conn_123&method=api&limit=20'
);
const { threads } = await response.json();
```

### Setup Webhook

```typescript
await fetch('/api/webhooks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    connection_id: 'conn_123',
    url: 'https://your-app.com/webhook',
    events: ['email.received'],
    secret: 'webhook-secret'
  })
});
```

## Performance Comparison

| Operation | Gmail API | SMTP/IMAP | Winner |
|-----------|-----------|-----------|---------|
| Send email | ~200-500ms | ~300-800ms | Gmail API |
| Fetch thread | ~150-300ms | ~500-1500ms | Gmail API |
| List threads | ~200-400ms | ~1000-3000ms | Gmail API |
| Real-time notifications | <1s (Push) | <5s (IDLE) | Gmail API |
| Initial setup | Complex | Simple | SMTP/IMAP |
| Maintenance | Watch renewal | Connection management | Gmail API |
| Multi-provider | ❌ | ✅ | SMTP/IMAP |

## Recommendations

### Use Gmail API if:
- Building a Gmail-focused application
- Need real-time notifications at scale
- Want to leverage Gmail-specific features
- Willing to invest in proper infrastructure setup
- Have resources for Google security review

### Use SMTP/IMAP if:
- Supporting multiple email providers
- Need quick prototype/experiment
- Want to avoid Google's API policies
- Basic send/receive is sufficient
- Prefer standard protocols

### Hybrid Approach:
Some services use both:
- **IMAP for receiving** (simpler, no Pub/Sub needed)
- **Gmail API for sending** (better alias support, DKIM/SPF)

This avoids Pub/Sub complexity while getting better sending capabilities.

## Security Considerations

### Token Storage
- All tokens encrypted at rest in database
- Refresh tokens used to obtain new access tokens
- Tokens never exposed to client

### Webhook Security
- HMAC SHA256 signatures for webhook verification
- Unique secrets per webhook
- Signature sent in `X-Webhook-Signature` header

### OAuth Scopes
- Request minimum necessary scopes
- Gmail API scopes more granular than `https://mail.google.com/`
- Users see exactly what permissions are requested

## Future Enhancements

- [ ] Attachment handling improvements
- [ ] Batch operations for bulk sending
- [ ] Email templates support
- [ ] Scheduled sending
- [ ] Email tracking (opens, clicks)
- [ ] Spam detection integration
- [ ] Multi-account support per user
- [ ] Rate limiting and retry logic
- [ ] Comprehensive error handling
- [ ] Admin dashboard
- [ ] Metrics and monitoring

## Conclusion

This implementation demonstrates both Gmail API and SMTP/IMAP approaches are viable, with different trade-offs:

- **Gmail API** provides a superior feature set and performance but requires more infrastructure
- **SMTP/IMAP** offers simplicity and universality but with limited capabilities

For a production Gmail integration, the Gmail API is recommended. For a multi-provider email service or quick prototype, SMTP/IMAP is more practical.

The ideal solution depends on your specific requirements, scale, and resources.
