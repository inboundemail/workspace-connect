# Google Cloud Pub/Sub Setup for Gmail Notifications

This document explains the Pub/Sub configuration for the `inbound-org` project and how to use it.

## What Was Configured

### Project: `inbound-org`

✅ **Enabled APIs:**
- Gmail API
- Cloud Pub/Sub API

✅ **Created Resources:**
- **Topic**: `projects/inbound-org/topics/gmail-notifications`
- **Subscription**: `gmail-sub` (pull-based)

## Organization Policy Issue

Your organization has a policy (`iam.allowedPolicyMemberDomains`) that prevents external service accounts from being added to IAM policies. This blocks the Gmail API service account (`gmail-api-push@system.gserviceaccount.com`) from publishing to your Pub/Sub topic.

### Impact:
- **Gmail API Push Notifications**: ❌ Cannot use (requires org policy change)
- **Pull-Based Polling**: ✅ Works now (implemented)

## Two Approaches

### Approach 1: Pull-Based Polling (Current Implementation)

Instead of Gmail pushing notifications to your webhook, your app polls the Pub/Sub subscription for messages.

**Pros:**
- Works now without org policy changes
- No need for publicly accessible webhook endpoint
- Simpler security model

**Cons:**
- Slight delay (polling interval: 10 seconds)
- Uses more API quota (constant polling)
- Requires background process

**How to use:**

```bash
# Poll once (good for cron jobs)
npm run poll:once

# Continuous polling (good for long-running services)
npm run poll:start
```

**Example cron setup:**
```bash
# Poll every minute
* * * * * cd /path/to/workspace-connect && npm run poll:once
```

**For production:**
Deploy the poller as a background service:
```bash
# Using systemd, Docker, or your preferred process manager
npm run poll:start
```

### Approach 2: Push Notifications (Requires Org Policy Update)

For this to work, someone with **Organization Policy Administrator** needs to:

1. Update the org policy (policy files included in repo):
   ```bash
   # Try v2 format first
   gcloud org-policies set-policy gmail-policy.yaml --project=inbound-org

   # Or try legacy v1 format
   gcloud resource-manager org-policies set-policy gmail-policy-legacy.yaml --project=inbound-org
   ```

2. Grant Gmail permission:
   ```bash
   gcloud pubsub topics add-iam-policy-binding gmail-notifications \
     --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
     --role=roles/pubsub.publisher \
     --project=inbound-org
   ```

3. Update subscription to push mode:
   ```bash
   # Delete pull subscription
   gcloud pubsub subscriptions delete gmail-sub --project=inbound-org

   # Create push subscription
   gcloud pubsub subscriptions create gmail-sub \
     --topic=gmail-notifications \
     --push-endpoint=https://yourdomain.com/api/webhooks/gmail-pubsub \
     --project=inbound-org
   ```

**Pros:**
- Real-time notifications (<1 second latency)
- More efficient (no constant polling)
- Standard Gmail API approach

**Cons:**
- Requires org policy change
- Needs publicly accessible webhook endpoint
- More complex security (verify signatures)

## How Gmail API Integration Works

### 1. User Authentication
```typescript
// User signs in with Google OAuth
await signIn.social({ provider: "google" });
```

### 2. Setup Watch
```typescript
// Your app calls Gmail API to start watching the mailbox
await service.setupPushNotifications("gmail-notifications");
```

This tells Gmail: "Notify me when emails arrive for this user"

### 3. Receive Notifications

**With Push (if org policy fixed):**
- Gmail → Pub/Sub Topic → Push Subscription → Your `/api/webhooks/gmail-pubsub` endpoint

**With Pull (current setup):**
- Gmail → Pub/Sub Topic → Pull Subscription → Your Poller (`npm run poll:start`)

### 4. Process Changes
```typescript
// Get what changed since last historyId
const history = await service.getHistory(lastHistoryId);

// Process new messages
for (const item of history.history) {
  if (item.messagesAdded) {
    // Handle new email
  }
}
```

### 5. Trigger Webhooks
```typescript
// Send to user's configured webhook
await sendWebhooksForConnection(connectionId, {
  type: "email.received",
  data: { /* email details */ }
});
```

## Current Configuration Summary

| Component | Value |
|-----------|-------|
| **Project** | `inbound-org` |
| **Topic** | `gmail-notifications` |
| **Subscription** | `gmail-sub` (push) |
| **Push Endpoint** | `https://dev.inbound.new/api/webhooks/gmail-pubsub` |
| **Method** | Push-based (real-time) |
| **Status** | ✅ Active |

## Environment Variables

Add to your `.env`:

```bash
# Google Cloud (already configured)
GOOGLE_CLOUD_PROJECT_ID=inbound-org
GOOGLE_PUBSUB_TOPIC=gmail-notifications

# Get these from Google Cloud Console → APIs & Services → Credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

## Monitoring

### Check subscription status:
```bash
gcloud pubsub subscriptions describe gmail-sub --project=inbound-org
```

### See pending messages:
```bash
gcloud pubsub subscriptions pull gmail-sub \
  --limit=5 \
  --project=inbound-org
```

### Check topic activity:
```bash
gcloud pubsub topics list --project=inbound-org
```

## Troubleshooting

### Polling not receiving messages?

1. **Check if watch is active:**
   ```sql
   SELECT email, gmail_watch_expiration
   FROM gmail_connection
   WHERE connection_type = 'api';
   ```

   Watch expires after 7 days. Renew it:
   ```typescript
   await service.setupPushNotifications("gmail-notifications");
   ```

2. **Check Pub/Sub subscription:**
   ```bash
   gcloud pubsub subscriptions describe gmail-sub --project=inbound-org
   ```

3. **Test with a real email:**
   - Send an email to the watched Gmail account
   - Wait 10 seconds (polling interval)
   - Check logs: `npm run poll:once`

### Gmail API quota exceeded?

Gmail API has quotas:
- 1 billion quota units/day
- 250 quota units/second/user

Check usage:
https://console.cloud.google.com/apis/api/gmail.googleapis.com/quotas?project=inbound-org

### Can't authenticate?

Make sure OAuth consent screen is configured:
https://console.cloud.google.com/apis/credentials/consent?project=inbound-org

## Cost Estimate

**Pull Subscription:**
- Pub/Sub: $0.40 per million operations
- Gmail API: Free (within quotas)
- At 1 poll every 10 seconds = ~8,640 polls/day = minimal cost

**Push Subscription:**
- Pub/Sub: $0.40 per million operations
- Only charged when messages delivered = even cheaper

## Next Steps

1. **For quick testing**: Use `npm run poll:start` (works now)
2. **For production**: Decide if you want to:
   - Keep using pull (simpler, works now)
   - Request org policy update for push (more efficient)

## Alternative: Use SMTP/IMAP Instead

If the org policy issues are too complex, consider using SMTP/IMAP instead of Gmail API:

- No Pub/Sub needed
- Uses IMAP IDLE for real-time notifications
- Works with any email provider, not just Gmail
- See `IMPLEMENTATION.md` for comparison

## Resources

- [Gmail API Push Notifications](https://developers.google.com/gmail/api/guides/push)
- [Cloud Pub/Sub Documentation](https://cloud.google.com/pubsub/docs)
- [Organization Policies](https://cloud.google.com/resource-manager/docs/organization-policy/overview)
