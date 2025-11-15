# Gmail Push Notifications Setup

Real-time push notifications via Google Cloud Pub/Sub for Gmail API integration.

## Configuration

| Setting | Value |
|---------|-------|
| **Subscription Type** | Push |
| **Push Endpoint** | `https://yourdomain.com/api/webhooks/gmail-pubsub` |
| **Ack Deadline** | 60 seconds |
| **Message Retention** | 7 days |

## How It Works

1. User authenticates with Google OAuth
2. App calls Gmail API `setupPushNotifications()`
3. Gmail monitors user's mailbox
4. New email arrives → Gmail publishes to Pub/Sub topic
5. Pub/Sub pushes to your webhook endpoint
6. App processes notification and triggers user webhooks

## Flow

```
New Email
  ↓
Gmail API detects change
  ↓
Publishes to: projects/YOUR_PROJECT/topics/gmail-notifications
  ↓
Pub/Sub pushes to: https://yourdomain.com/api/webhooks/gmail-pubsub
  ↓
Your app:
  - Decodes base64 message
  - Gets { emailAddress, historyId }
  - Calls Gmail API history.list
  - Fetches new message details
  - Stores in database
  - Triggers user webhooks
```

## Notification Format

Pub/Sub sends:
```json
{
  "message": {
    "data": "base64-encoded-json",
    "messageId": "...",
    "publishTime": "..."
  }
}
```

Decoded data:
```json
{
  "emailAddress": "user@gmail.com",
  "historyId": "1234567890"
}
```

App processes:
1. Find Gmail connection for that email
2. Call `history.list` with historyId
3. Process new messages
4. Send webhooks in inbound.new format

## Testing

### Start Server
```bash
npm run dev
```

### Expose Endpoint
Use ngrok or similar:
```bash
ngrok http 3000
# Note the HTTPS URL
```

Update Pub/Sub subscription with your URL.

### Create Connection
```bash
POST /api/connections
{
  "user_id": "user_123",
  "email": "user@gmail.com",
  "connection_type": "api",
  "start_watching": true
}
```

### Send Test Email
Send email to connected Gmail account. Within 1-2 seconds:
- POST request to `/api/webhooks/gmail-pubsub` in logs
- Email logged to database
- User webhooks triggered (if configured)

## Watch Management

**Gmail watches expire after 7 days.**

### Vercel Cron (Recommended)

`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-gmail-watches",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Environment variable:
```bash
CRON_SECRET=your-random-secret-string
```

Vercel dashboard → Cron Jobs → Add header:
- Name: `Authorization`
- Value: `Bearer YOUR_CRON_SECRET`

### Manual Renewal
```typescript
import { createGmailAPIService } from '@/lib/services/gmail-api';

const service = await createGmailAPIService(connectionId);
await service.setupPushNotifications("gmail-notifications");
```

### Automated Renewal
```typescript
import { refreshGmailAPIWatches } from '@/lib/services/email-watcher';

// Call daily
await refreshGmailAPIWatches();
```

### Other Platforms

Add to `package.json`:
```json
{
  "scripts": {
    "refresh-watches": "tsx scripts/refresh-gmail-watches.ts"
  }
}
```

Run via cron:
```bash
0 2 * * * cd /path/to/workspace-connect && npm run refresh-watches
```

## Security

### Pub/Sub Authentication
Endpoint protected by:
- Domain restriction (only your endpoint receives pushes)
- HTTPS encryption
- Message validation

Optional: Verify Pub/Sub JWT token in `Authorization` header.

### Webhook Signatures
Outgoing webhooks include HMAC SHA256:
```typescript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');

// Sent as X-Webhook-Signature header
```

## Monitoring

### Subscription Status
```bash
gcloud pubsub subscriptions describe gmail-sub --project=YOUR_PROJECT_ID
```

### Recent Messages
```bash
gcloud pubsub subscriptions pull gmail-sub --limit=5 --project=YOUR_PROJECT_ID
```

Note: With push, messages deliver immediately. This should be empty.

### Topic Activity
```bash
gcloud pubsub topics list-subscriptions gmail-notifications --project=YOUR_PROJECT_ID
```

### Endpoint Health
Check logs for POST requests to `/api/webhooks/gmail-pubsub`.

## Troubleshooting

### Not Receiving Notifications

**Check watch status:**
```sql
SELECT email, gmail_watch_expiration
FROM gmail_connection
WHERE connection_type = 'api' AND is_active = true;
```

If expired:
```typescript
await service.setupPushNotifications("gmail-notifications");
```

**Verify endpoint:**
```bash
curl https://yourdomain.com/api/webhooks/gmail-pubsub
```

Should return 400 (validation error), not 404.

**Check Pub/Sub delivery:**
```bash
gcloud pubsub subscriptions describe gmail-sub --project=YOUR_PROJECT_ID
```

Look for delivery errors.

**Manual test:**
```bash
gcloud pubsub topics publish gmail-notifications \
  --message='{"emailAddress":"test@example.com","historyId":"123"}' \
  --project=YOUR_PROJECT_ID
```

Endpoint should receive within seconds.

### Webhook Not Triggering

**Check database:**
```sql
SELECT * FROM email_log ORDER BY created_at DESC LIMIT 5;
```

If logged but no webhooks:

```sql
SELECT * FROM webhook WHERE is_active = true;
```

Check logs for webhook delivery attempts.

## Performance

- Email arrives → Gmail detects: <1s
- Gmail → Pub/Sub: <100ms
- Pub/Sub → Webhook: <500ms
- **Total: <2s end-to-end**

## Quota

- Gmail API: 1B quota units/day
- Pub/Sub: Unlimited (pay per message)
- Watch notifications: ~1/sec max per user

## Cost

- Gmail API: Free (within quotas)
- Pub/Sub: ~$0.40 per million operations
- At 100 emails/day/user: Essentially free

## Production Deployment

1. **Update push endpoint:**
```bash
gcloud pubsub subscriptions delete gmail-sub --project=YOUR_PROJECT_ID

gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://yourdomain.com/api/webhooks/gmail-pubsub \
  --project=YOUR_PROJECT_ID
```

2. **Setup watch renewal** (cron job)
3. **Monitor delivery metrics**
4. **Configure alerting** for failures

## Switching to Pull

If push doesn't work for your setup:

```bash
# Delete push subscription
gcloud pubsub subscriptions delete gmail-sub --project=YOUR_PROJECT_ID

# Create pull subscription
gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --ack-deadline=60 \
  --project=YOUR_PROJECT_ID

# Start polling
npm run poll:start
```

See [references/PUBSUB_POLLING.md](./references/PUBSUB_POLLING.md) for details.

## Summary

Push notifications provide:
- Real-time delivery (<2s)
- Automatic email processing
- User webhook triggers
- No polling required
- Production-ready

Requirements:
- Server running
- Public HTTPS endpoint
- Active watches (renewed every 7 days)
