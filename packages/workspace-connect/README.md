# workspace-connect

**Stateless Gmail watch service for Node.js** - handles Gmail API watches, Pub/Sub webhooks, and real-time email notifications.

## Features

- ✅ **Stateless** - No database or storage required
- ✅ **Auth agnostic** - Works with any OAuth provider (Better Auth, Clerk, NextAuth, custom)
- ✅ **Framework ready** - Next.js adapter included, easy to add others
- ✅ **Simple callbacks** - You control all data storage and business logic
- ✅ **TypeScript first** - Full type safety

## Installation

```bash
npm install workspace-connect
```

## Quick Start

### 1. Setup Handler (Next.js App Router)

```typescript
// app/api/workspace-connect/[...slug]/route.ts
import { workspaceConnectHandler } from "workspace-connect/next";
import { db } from "@/lib/db";

export const { GET, POST, DELETE } = workspaceConnectHandler({
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    pubSubProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
    pubSubTopicName: 'gmail-notifications', // optional
  },
  
  cronSecret: process.env.CRON_SECRET!,
  
  // Provide token lookup from YOUR database
  getTokens: async (email) => {
    const user = await db.user.findUnique({
      where: { email },
      include: { googleAccount: true },
    });
    return {
      accessToken: user.googleAccount.accessToken,
      refreshToken: user.googleAccount.refreshToken,
    };
  },
  
  // Called after watch is started
  onWatchStarted: async ({ email, expiration, historyId }) => {
    await db.gmailWatch.create({
      data: { email, expiration, historyId },
    });
  },
  
  // Called after watch is stopped
  onWatchStopped: async ({ email }) => {
    await db.gmailWatch.delete({ where: { email } });
  },
  
  // Called when new email notification arrives
  onEmailReceived: async ({ emailAddress, historyId }) => {
    console.log(`New email for ${emailAddress}, historyId: ${historyId}`);
    // Process notification with your business logic
  },
  
  // Return watches that need refresh (for cron)
  getExpiringWatches: async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return await db.gmailWatch.findMany({
      where: { expiration: { lte: tomorrow } },
      select: { email: true },
    });
  },
  
  // Called after watch is refreshed
  onWatchRefreshed: async ({ email, newExpiration }) => {
    await db.gmailWatch.update({
      where: { email },
      data: { expiration: newExpiration },
    });
  },
});
```

### 2. Configure Google Cloud Pub/Sub

You will need to configure Google Cloud Pub/Sub to send notifications to your app. Remember your `PROJECT_ID` since we will use it in the next steps.

```bash
# 1. Create Pub/Sub topic
gcloud pubsub topics create gmail-notifications \
  --project=YOUR_PROJECT_ID

# 2. Grant Gmail API permission to publish
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=YOUR_PROJECT_ID

# 3. Create push subscription (points to your app)
gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://your-app.com/api/workspace-connect/providers/gmail \
  --project=YOUR_PROJECT_ID
```

**Note:** This is project-level configuration, not per-user. All Gmail accounts authenticate via your OAuth app and publish to this same topic.

### 3. Configure Cron (Vercel)

```json
// vercel.json
{
  "crons": [{
    "path": "/api/workspace-connect/cron/watch-refresh",
    "schedule": "0 2 * * *"
  }]
}
```

Gmail watches expire after 7 days, so this cron job refreshes them daily.

## API Routes

The handler automatically exposes these routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `/watch` | POST | Start watching an email |
| `/watch` | DELETE | Stop watching an email |
| `/providers/gmail` | POST | Gmail Pub/Sub webhook endpoint |
| `/cron/watch-refresh` | GET | Refresh expiring watches (cron) |

### Start Watch

**Option 1: Via HTTP API**
```bash
POST /api/workspace-connect/watch
Content-Type: application/json

{
  "email": "user@gmail.com"
}
```

**Option 2: Via SDK**
```typescript
import { GmailWatchService } from 'workspace-connect';

const gmail = new GmailWatchService({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
});

const watch = await gmail.startWatch({
  email: 'user@gmail.com',
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  topicName: 'projects/PROJECT_ID/topics/gmail-notifications',
});
// Returns: { email, watchId, expiration, historyId }
```

**Flow:**
1. Handler calls your `getTokens(email)` to get OAuth tokens
2. Calls Gmail API to setup watch
3. Calls your `onWatchStarted` callback with watch details
4. You store the watch info in your database

### Stop Watch

**Option 1: Via HTTP API**
```bash
DELETE /api/workspace-connect/watch
Content-Type: application/json

{
  "email": "user@gmail.com"
}
```

**Option 2: Via SDK**
```typescript
await gmail.stopWatch({
  email: 'user@gmail.com',
  accessToken: tokens.accessToken,
});
```

**Flow:**
1. Handler calls your `getTokens(email)`
2. Calls Gmail API to stop watch
3. Calls your `onWatchStopped` callback
4. You remove the watch from your database

### Gmail Pub/Sub (automatic)

Google Cloud automatically sends notifications here when emails arrive.

**Handler Route:**
```bash
POST /api/workspace-connect/providers/gmail
# (Google Cloud sends Pub/Sub push notification)
```

**Parse Manually (SDK):**
```typescript
const notification = gmail.parsePubSubNotification(requestBody);
// Returns: { emailAddress: 'user@gmail.com', historyId: '12345' }
```

**Flow:**
1. Handler parses Pub/Sub message
2. Extracts `emailAddress` and `historyId`
3. Calls your `onEmailReceived` callback
4. You process the notification (fetch messages, store data, etc.)

### Refresh Watches

**Option 1: Via Cron (HTTP API)**
```bash
GET /api/workspace-connect/cron/watch-refresh
Authorization: Bearer <CRON_SECRET>
```

**Option 2: Via SDK**
```typescript
const updated = await gmail.refreshWatch({
  email: 'user@gmail.com',
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  topicName: 'projects/PROJECT_ID/topics/gmail-notifications',
});
// Returns: { email, watchId, expiration, historyId }
```

**Flow (HTTP API):**
1. Verifies cron secret
2. Calls your `getExpiringWatches()` to get list
3. For each watch:
   - Calls `getTokens(email)`
   - Refreshes watch via Gmail API
   - Calls `onWatchRefreshed` with new expiration
4. You update your database

## Example: Link Email Flow

```typescript
// lib/gmail.ts - Initialize the service once
import { GmailWatchService } from 'workspace-connect';

export const gmail = new GmailWatchService({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
});

// app/api/link-email/route.ts
import { gmail } from '@/lib/gmail';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const session = await auth(); // Your auth system
  const { email } = await request.json();
  
  // Get Google tokens from your auth provider
  const googleAccount = await db.account.findFirst({
    where: { 
      userId: session.user.id,
      provider: 'google'
    }
  });
  
  // Start watch using SDK
  const watch = await gmail.startWatch({
    email,
    accessToken: googleAccount.access_token,
    refreshToken: googleAccount.refresh_token,
    topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`,
  });
  
  // Save to your database
  await db.gmailWatch.create({
    data: {
      userId: session.user.id,
      email: watch.email,
      expiration: watch.expiration,
      historyId: watch.historyId,
    }
  });
  
  return Response.json({ success: true, watch });
}
```

## Direct Gmail API Access

For advanced use cases, use the `GmailWatchService` directly:

```typescript
import { GmailWatchService } from 'workspace-connect';

const gmail = new GmailWatchService({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
});

// Start watch manually
const watch = await gmail.startWatch({
  email: 'user@gmail.com',
  accessToken: 'ya29.xxx',
  refreshToken: '1//xxx',
  topicName: 'projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications',
});

// Stop watch
await gmail.stopWatch({
  email: 'user@gmail.com',
  accessToken: 'ya29.xxx',
});

// Refresh watch
const updated = await gmail.refreshWatch({
  email: 'user@gmail.com',
  accessToken: 'ya29.xxx',
  refreshToken: '1//xxx',
  topicName: 'projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications',
});

// Parse Pub/Sub notification
const notification = gmail.parsePubSubNotification(pubsubPayload);
// { emailAddress: 'user@gmail.com', historyId: '12345' }

// Refresh access token
const tokens = await gmail.refreshAccessToken('1//xxx');
```

## TypeScript Types

```typescript
import type {
  WorkspaceConnectHandlerOptions,
  GoogleConfig,
  GoogleTokens,
  WatchInfo,
  EmailNotification,
} from "workspace-connect";
```

## Environment Variables

```bash
# Required
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_CLOUD_PROJECT_ID=your-project-id
CRON_SECRET=random-secret-for-cron-jobs

# Optional
GOOGLE_PUBSUB_TOPIC=gmail-notifications  # defaults to 'gmail-notifications'
```

## Architecture

```
User clicks "Link Email"
  ↓
POST /api/workspace-connect/watch { email }
  ↓
Handler calls getTokens(email) [YOUR implementation]
  ↓
Gmail API creates watch
  ↓
Handler calls onWatchStarted() [YOUR implementation]
  ↓
You save watch to database

---

Gmail receives new email
  ↓
Gmail publishes to Pub/Sub topic
  ↓
Pub/Sub pushes to /providers/gmail
  ↓
Handler parses notification
  ↓
Handler calls onEmailReceived() [YOUR implementation]
  ↓
You process notification

---

Cron runs daily
  ↓
GET /api/workspace-connect/cron/watch-refresh
  ↓
Handler calls getExpiringWatches() [YOUR implementation]
  ↓
Handler refreshes each watch via Gmail API
  ↓
Handler calls onWatchRefreshed() [YOUR implementation]
  ↓
You update database
```

## What This Package Does

✅ Gmail API calls (start/stop/refresh watches)  
✅ Pub/Sub message parsing  
✅ HTTP routing for Next.js  
✅ Token refresh handling  
✅ Error handling  

## What You Implement

✅ Token storage (from your OAuth provider)  
✅ Watch data storage (your database)  
✅ `getTokens` lookup  
✅ Event callbacks  
✅ Email processing logic  

## Security

- **Token lookup**: `getTokens` authenticates based on email
- **Cron protection**: `cronSecret` prevents unauthorized access
- **Pub/Sub validation**: Google Cloud handles authentication for push subscriptions

## Performance

- **Bundle sizes**: ~15KB (gzipped)
- **Notification latency**: <2s end-to-end (Gmail → Pub/Sub → your app)
- **Watch refresh**: O(n) where n = active watches (runs daily)

## Error Handling

All callbacks should handle errors:

```typescript
onEmailReceived: async ({ emailAddress, historyId }) => {
  try {
    await processEmail(emailAddress, historyId);
  } catch (error) {
    console.error('Failed to process email:', error);
    // Log to your error tracking service
    // Don't throw - return 200 to Pub/Sub to acknowledge receipt
  }
}
```

## Examples

See the main Next.js app in this repo for a complete implementation example.

## License

MIT
