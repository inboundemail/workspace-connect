# Pub/Sub Pull-Based Polling (Alternative)

Alternative to push notifications. Use this if you can't configure push endpoints or need to test locally without exposing your server.

## When to Use

- Testing locally without ngrok/tunneling
- Organization policies block Gmail service account
- No public HTTPS endpoint available
- Development/debugging

## Setup

Topic and subscription should already exist from main setup. If not:

```bash
# Create topic
gcloud pubsub topics create gmail-notifications --project=YOUR_PROJECT_ID

# Create PULL subscription (not push)
gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --ack-deadline=60 \
  --project=YOUR_PROJECT_ID
```

## Usage

### One-Time Poll
```bash
npm run poll:once
```

### Continuous Polling
```bash
npm run poll:start
```

Polls every 10 seconds by default.

### Cron Job
```bash
# Poll every minute
* * * * * cd /path/to/workspace-connect && npm run poll:once
```

## How It Works

1. Gmail API watch triggers → publishes to Pub/Sub topic
2. Your app polls subscription for messages
3. Processes messages and acknowledges them
4. Continues polling

## Pros

- No public endpoint needed
- Works with restrictive firewalls
- Simple security model
- Good for development

## Cons

- Delayed notifications (polling interval)
- More API calls (constant polling)
- Requires long-running process or frequent cron
- Less efficient than push

## Configuration

Polling interval configured in `lib/services/gmail-pubsub-poller.ts`:

```typescript
export async function startPolling(intervalMs: number = 10000) {
  // Poll every 10 seconds by default
}
```

## Switching from Push to Pull

If you're currently using push and want to switch:

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

## Cost

- Pub/Sub: $0.40 per million operations
- At 1 poll every 10 seconds: ~8,640 polls/day
- Minimal cost for small scale

## Production Deployment

For production with pull-based polling:

```bash
# Using systemd
sudo systemctl start workspace-connect-poller

# Using Docker
docker run -d workspace-connect npm run poll:start

# Using PM2
pm2 start npm --name "gmail-poller" -- run poll:start
```

## Monitoring

Check if poller is running:
```bash
ps aux | grep poll
```

Check recent messages:
```bash
gcloud pubsub subscriptions pull gmail-sub --limit=5 --project=YOUR_PROJECT_ID
```
