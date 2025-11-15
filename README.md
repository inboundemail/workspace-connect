# Workspace Connect

Workspace Connect is a wrapper on Gmail, Outlook (Office 365) and other email providers allowing you to have a simple interface (provider agnostic)

## Roadmap:

| Provider | Receiving | Sending |
|----------|-----------|---------|
| Gmail    | ✅ Working | ✅ Working |
| Outlook  | ❌ Not implemented | ❌ Not implemented |

## Features

- **Gmail API integration** with real-time Pub/Sub push notifications (<1s latency)
- **Simple REST API** for sending and receiving emails
- **Inbound.new webhook format** for receiving emails
- **Thread support** with proper conversation grouping
- **OAuth2 + API Key authentication** via Better Auth
- **Full audit trail** - all emails logged to database
- **Microservice ready** - API key authentication for service-to-service calls

## Self-Hosting

### Prerequisites

- Node.js 20+
- Neon Postgres database (or any Postgres)
- Google Cloud account with billing enabled
- Domain with HTTPS (for Pub/Sub webhooks)

### 1. Database Setup

```bash
# Clone and install
git clone <repo>
cd workspace-connect
npm install

# Push schema to database
npm run db:push
# Note: If upgrading from SMTP/IMAP version, confirm column deletions
```

### 2. Google OAuth Setup

**Google Cloud Console → APIs & Services → Credentials**

1. Create OAuth 2.0 Client ID (Web application)
2. Add authorized redirect URI: `https://yourdomain.com/api/auth/callback/google`
3. Enable Gmail API
4. Add scopes in OAuth consent screen:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`

### 3. Google Cloud Pub/Sub Setup

**Required for real-time email notifications.**

```bash
# Enable APIs
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project=YOUR_PROJECT_ID

# Create topic
gcloud pubsub topics create gmail-notifications --project=YOUR_PROJECT_ID

# Create push subscription
gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://yourdomain.com/api/webhooks/gmail-pubsub \
  --ack-deadline=60 \
  --project=YOUR_PROJECT_ID

# Grant Gmail publisher access
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=YOUR_PROJECT_ID
```

**Org policy issues?** See [references/PUBSUB_SETUP.md](./references/PUBSUB_SETUP.md) for handling `iam.allowedPolicyMemberDomains` restrictions.

### 4. Environment Variables

Create `.env`:

```bash
# Database
DATABASE_URL="postgresql://..."

# Better Auth
BETTER_AUTH_SECRET="generate-random-32-char-string"
BETTER_AUTH_URL="https://yourdomain.com"

# Google OAuth
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxx"

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID="your-project-id"
GOOGLE_PUBSUB_TOPIC="gmail-notifications"
```

### 5. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### Gmail Watch Management

Gmail API watches expire after 7 days. Renew them via:

```bash
# Run daily cron job
npm run refresh-watches
```

Or manually via API:
```typescript
POST /api/connections
{
  "user_id": "...", // better-auth user id
  "email": "user@gmail.com", // email you want to enable for watch
  "connection_type": "api",
  "start_watching": true  // Sets up watch
}
```

## API Authentication

### OAuth2 (User Authentication)

Users authenticate via Google OAuth:
```bash
GET /api/auth/signin/google
```

### API Keys (Service-to-Service)

For microservice deployments, use API keys for machine-to-machine authentication.

#### Create API Key
```bash
POST /api/api-keys
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "name": "Production Service",
  "expiresIn": 31536000  // Optional: seconds (1 year)
}

# Response
{
  "id": "key_xxx",
  "name": "Production Service",
  "key": "ws_xxxxxxxxxxxx",  // Only returned on creation
  "expiresAt": "2025-01-01T00:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### List API Keys
```bash
GET /api/api-keys
Authorization: Bearer <session-token>
```

#### Delete API Key
```bash
DELETE /api/api-keys?id=key_xxx
Authorization: Bearer <session-token>
```

#### Using API Keys

Include API key in requests:
```bash
# All API endpoints support API key authentication
POST /api/send
Authorization: Bearer ws_xxxxxxxxxxxx
Content-Type: application/json

{
  "connection_id": "conn_xxx",
  "from": "sender@gmail.com",
  "to": ["recipient@example.com"],
  "subject": "Hello",
  "html": "<p>World</p>"
}
```

API keys authenticate the user, giving access to their connections and data.

## API Reference

### Send Email
> This endpoint is compatible with the Resend API.

```bash
POST /api/send
Content-Type: application/json

{
  "connection_id": "conn_xxx",
  "from": "sender@gmail.com",
  "to": ["recipient@example.com"],
  "subject": "Subject",
  "html": "<p>Body</p>",
  "thread_id": "optional-thread-id"
}
```

### List Threads
```bash
GET /api/threads?connection_id=conn_xxx&limit=50&page_token=xxx
```

### Get Thread
```bash
GET /api/thread/:id?connection_id=conn_xxx
```

### Create Connection
```bash
POST /api/connections
{
  "user_id": "user_xxx",
  "email": "user@gmail.com",
  "connection_type": "api",
  "start_watching": true
}
```

### Setup Webhook
```bash
POST /api/webhooks
{
  "connection_id": "conn_xxx",
  "url": "https://your-app.com/webhook",
  "events": ["email.received"]
}
```

Webhook receives inbound.new format:
```json
{
  "type": "email.received",
  "id": "evt_xxx",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "id": "msg_xxx",
    "from": { "email": "sender@example.com", "name": "Sender" },
    "to": [{ "email": "you@gmail.com" }],
    "subject": "Subject",
    "text": "Body",
    "html": "<p>Body</p>",
    "thread_id": "thread_xxx"
  }
}
```

## Architecture

```
User Gmail → Gmail API Watch → Pub/Sub Topic → Push Subscription
→ /api/webhooks/gmail-pubsub → History API → Parse Email
→ Store in DB → Trigger User Webhooks
```

## Database Schema

### Core Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `user` | Better Auth user accounts | id, email, name |
| `session` | Active user sessions | id, userId, token, expiresAt |
| `account` | OAuth provider accounts | id, userId, providerId, accessToken, refreshToken |
| `verification` | Email/phone verifications | id, identifier, value, expiresAt |
| `api_key` | Service-to-service API keys | id, userId, name, key, expiresAt |

### Email Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `gmail_connection` | Gmail API connections | id, userId, email, gmailAccessToken, gmailRefreshToken, gmailHistoryId, gmailWatchExpiration |
| `webhook` | User webhook configurations | id, userId, gmailConnectionId, url, secret, events |
| `email_log` | All sent/received email logs | id, gmailConnectionId, messageId, threadId, from, to, direction, status |
| `parsed_emails` | Parsed email content | id, messageId, threadId, html, text, attachments |

## Troubleshooting

**No notifications received?**
```sql
-- Check watch expiration
SELECT email, gmail_watch_expiration
FROM gmail_connection
WHERE connection_type = 'api';

-- If expired, recreate connection with start_watching: true
```

**Pub/Sub delivery issues?**
```bash
# Check subscription status
gcloud pubsub subscriptions describe gmail-sub --project=YOUR_PROJECT_ID

# View recent messages (should be empty with push)
gcloud pubsub subscriptions pull gmail-sub --limit=5 --project=YOUR_PROJECT_ID
```

**Organization policy errors?**
- Requires `Organization Policy Administrator` role
- Update policy at organization level, not project level
- See section 3 for commands

## Performance

- Send email: ~250ms
- Fetch thread: ~200ms
- List 50 threads: ~300ms
- Real-time notification: <1s

## Limitations

- Gmail watches expire every 7 days (auto-renewal recommended)
- Subject to Google API quotas (1B units/day, 250 units/sec/user)
- Gmail/Google Workspace only (Outlook coming soon)
- Requires public HTTPS endpoint for Pub/Sub

## Resources

- [Gmail API Docs](https://developers.google.com/gmail/api)
- [Pub/Sub Setup](./references/PUBSUB_SETUP.md) - Push notifications setup
- [Push Notifications](./references/GMAIL_PUSH_ACTIVE.md) - Detailed push configuration
- [Pull Polling](./references/PUBSUB_POLLING.md) - Alternative polling approach
- [Implementation Guide](./references/IMPLEMENTATION.md)
- [Code Examples](./references/EXAMPLES.md)

## License

MIT
