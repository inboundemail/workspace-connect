# Google Cloud Pub/Sub Setup

Push-based real-time notifications for Gmail API integration.

## Prerequisites

- Google Cloud project with billing enabled
- Organization Policy Administrator role (if hitting policy restrictions)
- Public HTTPS endpoint (production) or ngrok (development)

## Enable APIs

```bash
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project=YOUR_PROJECT_ID
```

## Create Topic

```bash
gcloud pubsub topics create gmail-notifications --project=YOUR_PROJECT_ID
```

## Create Push Subscription

```bash
gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://yourdomain.com/api/webhooks/gmail-pubsub \
  --ack-deadline=60 \
  --project=YOUR_PROJECT_ID
```

For development with ngrok:
```bash
gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://your-id.ngrok.io/api/webhooks/gmail-pubsub \
  --ack-deadline=60 \
  --project=YOUR_PROJECT_ID
```

## Grant Gmail Permission

Gmail service account needs publisher access to your topic.

### Check for Org Policy Errors

If you see errors about `gmail-api-push@system.gserviceaccount.com`:

```bash
# 1. Create org policy file
cat > org-policy.yaml <<EOF
name: organizations/YOUR_ORG_ID/policies/iam.allowedPolicyMemberDomains
spec:
  rules:
    - allowAll: true
EOF

# 2. Apply org policy (requires Org Policy Admin role)
gcloud org-policies set-policy org-policy.yaml

# 3. Grant publisher role
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=YOUR_PROJECT_ID
```

### Without Org Policy Issues

```bash
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=YOUR_PROJECT_ID
```

## Environment Variables

Add to `.env`:

```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_PUBSUB_TOPIC=gmail-notifications
```

## Verify Setup

```bash
# Check topic exists
gcloud pubsub topics list --project=YOUR_PROJECT_ID

# Check subscription
gcloud pubsub subscriptions describe gmail-sub --project=YOUR_PROJECT_ID

# Check IAM permissions
gcloud pubsub topics get-iam-policy gmail-notifications --project=YOUR_PROJECT_ID
```

## Test

### Start Server
```bash
npm run dev
```

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
Send email to the Gmail account. Check server logs for:
```
POST /api/webhooks/gmail-pubsub
```

### Manual Test
```bash
gcloud pubsub topics publish gmail-notifications \
  --message='{"emailAddress":"test@example.com","historyId":"123"}' \
  --project=YOUR_PROJECT_ID
```

## Update Endpoint

To change push endpoint:

```bash
# Delete old subscription
gcloud pubsub subscriptions delete gmail-sub --project=YOUR_PROJECT_ID

# Create new subscription with updated endpoint
gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://new-domain.com/api/webhooks/gmail-pubsub \
  --ack-deadline=60 \
  --project=YOUR_PROJECT_ID
```

## Monitoring

```bash
# Subscription status
gcloud pubsub subscriptions describe gmail-sub --project=YOUR_PROJECT_ID

# Topic subscriptions
gcloud pubsub topics list-subscriptions gmail-notifications --project=YOUR_PROJECT_ID

# Delivery metrics (Cloud Console)
# Pub/Sub → Subscriptions → gmail-sub → Metrics
```

## Cost

- Pub/Sub: ~$0.40 per million operations
- At 100 emails/day/user: negligible cost
- First 10GB/month free

## Alternative: Pull-Based Polling

If push doesn't work for your setup, see [references/PUBSUB_POLLING.md](./references/PUBSUB_POLLING.md).

## Resources

- [Gmail API Push Notifications](https://developers.google.com/gmail/api/guides/push)
- [Cloud Pub/Sub Documentation](https://cloud.google.com/pubsub/docs)
- [Push Notification Details](./GMAIL_PUSH_ACTIVE.md)
