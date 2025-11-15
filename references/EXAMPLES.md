# Usage Examples

This document provides practical examples of using the Workspace Connect API.

## Quick Start

### 1. User Authentication

First, users need to authenticate with Google:

```typescript
import { signIn } from "@/lib/auth-client";

// Trigger Google OAuth flow
await signIn.social({
  provider: "google",
  callbackURL: "/dashboard",
});
```

### 2. Create a Gmail Connection

After authentication, create a Gmail connection:

```typescript
const createConnection = async (userId: string, email: string) => {
  const response = await fetch("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      email: email,
      connection_type: "api", // or "smtp"
      start_watching: true, // Start watching for new emails
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create connection");
  }

  return await response.json();
};

// Usage
const connection = await createConnection("user_123", "user@gmail.com");
console.log("Connection ID:", connection.id);
```

## Sending Emails

### Basic Email

```typescript
const sendBasicEmail = async (connectionId: string) => {
  const response = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connection_id: connectionId,
      from: "sender@gmail.com",
      to: "recipient@example.com",
      subject: "Hello World",
      text: "This is a plain text email",
    }),
  });

  return await response.json();
};
```

### HTML Email with CC/BCC

```typescript
const sendHtmlEmail = async (connectionId: string) => {
  const response = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connection_id: connectionId,
      from: "sender@gmail.com",
      to: ["recipient1@example.com", "recipient2@example.com"],
      cc: "cc@example.com",
      bcc: "bcc@example.com",
      subject: "Newsletter",
      html: `
        <h1>Welcome!</h1>
        <p>This is an <strong>HTML</strong> email.</p>
      `,
    }),
  });

  return await response.json();
};
```

### Email with Attachments

```typescript
const sendEmailWithAttachment = async (connectionId: string) => {
  // Read file and convert to base64
  const fileBuffer = await fs.readFile("./document.pdf");
  const base64Content = fileBuffer.toString("base64");

  const response = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connection_id: connectionId,
      from: "sender@gmail.com",
      to: "recipient@example.com",
      subject: "Document Attached",
      text: "Please find the document attached.",
      attachments: [
        {
          filename: "document.pdf",
          content: base64Content,
          contentType: "application/pdf",
        },
      ],
    }),
  });

  return await response.json();
};
```

### Reply to Email (Threading)

```typescript
const replyToEmail = async (
  connectionId: string,
  threadId: string,
  inReplyTo: string,
  references: string[]
) => {
  const response = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connection_id: connectionId,
      from: "sender@gmail.com",
      to: "recipient@example.com",
      subject: "Re: Original Subject", // Keep same subject
      text: "This is a reply to your email.",
      thread_id: threadId, // Gmail thread ID
      in_reply_to: inReplyTo, // <message-id> of the message you're replying to
      references: [...references, inReplyTo], // Chain of message IDs
    }),
  });

  return await response.json();
};
```

### Force Specific Method

```typescript
// Force Gmail API
const sendViaAPI = await fetch("/api/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    connection_id: connectionId,
    method: "api", // Force Gmail API
    from: "sender@gmail.com",
    to: "recipient@example.com",
    subject: "Via Gmail API",
    text: "This will use Gmail API even if connection is configured for SMTP",
  }),
});

// Force SMTP
const sendViaSMTP = await fetch("/api/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    connection_id: connectionId,
    method: "smtp", // Force SMTP
    from: "sender@gmail.com",
    to: "recipient@example.com",
    subject: "Via SMTP",
    text: "This will use SMTP even if connection is configured for API",
  }),
});
```

## Reading Emails

### List All Threads

```typescript
const listThreads = async (connectionId: string, limit = 50) => {
  const response = await fetch(
    `/api/threads?connection_id=${connectionId}&limit=${limit}`
  );

  const data = await response.json();
  return data.threads;
};

// Usage
const threads = await listThreads("conn_123");
threads.forEach((thread) => {
  console.log(`${thread.subject} - ${thread.from} (${thread.messageCount} messages)`);
});
```

### Search Threads (Gmail API Only)

```typescript
const searchThreads = async (connectionId: string, query: string) => {
  const response = await fetch(
    `/api/threads?connection_id=${connectionId}&method=api&q=${encodeURIComponent(query)}`
  );

  return await response.json();
};

// Search examples
const unreadThreads = await searchThreads("conn_123", "is:unread");
const fromJohn = await searchThreads("conn_123", "from:john@example.com");
const withAttachments = await searchThreads("conn_123", "has:attachment");
const lastWeek = await searchThreads("conn_123", "after:2024/01/01");
```

### Paginate Through Threads

```typescript
const getAllThreads = async (connectionId: string) => {
  const allThreads = [];
  let pageToken = null;

  do {
    const url = new URL("/api/threads", "http://localhost:3000");
    url.searchParams.set("connection_id", connectionId);
    url.searchParams.set("limit", "100");
    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url.toString());
    const data = await response.json();

    allThreads.push(...data.threads);
    pageToken = data.next_page_token;
  } while (pageToken);

  return allThreads;
};
```

### Get Specific Thread

```typescript
const getThread = async (connectionId: string, threadId: string) => {
  const response = await fetch(
    `/api/thread/${threadId}?connection_id=${connectionId}`
  );

  const thread = await response.json();
  return thread;
};

// Usage
const thread = await getThread("conn_123", "thread_abc123");
console.log(`Thread has ${thread.messages.length} messages`);

thread.messages.forEach((msg) => {
  console.log(`From: ${msg.from}`);
  console.log(`Subject: ${msg.subject}`);
  console.log(`Date: ${msg.date}`);
  console.log(`Body: ${msg.body.text || msg.body.html}`);
  console.log("---");
});
```

### Extract Email Content

```typescript
const getEmailContent = async (connectionId: string, threadId: string) => {
  const thread = await getThread(connectionId, threadId);
  const latestMessage = thread.messages[thread.messages.length - 1];

  // Get plain text or HTML
  const content = latestMessage.body.text || latestMessage.body.html;

  // Parse sender
  const from = {
    email: latestMessage.from,
    name: latestMessage.from.split("<")[0].trim(),
  };

  return {
    from,
    subject: latestMessage.subject,
    content,
    date: new Date(latestMessage.date),
  };
};
```

## Webhooks

### Create a Webhook

```typescript
const createWebhook = async (connectionId: string, webhookUrl: string) => {
  const response = await fetch("/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connection_id: connectionId,
      url: webhookUrl,
      events: ["email.received"],
      // Optional: provide your own secret
      secret: "your-webhook-secret-key",
    }),
  });

  const webhook = await response.json();
  console.log("Webhook ID:", webhook.id);
  console.log("Webhook Secret:", webhook.secret); // Store this securely!

  return webhook;
};
```

### List Webhooks

```typescript
const listWebhooks = async (connectionId: string) => {
  const response = await fetch(`/api/webhooks?connection_id=${connectionId}`);
  const data = await response.json();
  return data.webhooks;
};
```

### Handle Incoming Webhook

```typescript
import crypto from "crypto";

// In your webhook endpoint (e.g., /api/your-webhook)
export async function POST(request: Request) {
  const signature = request.headers.get("X-Webhook-Signature");
  const webhookId = request.headers.get("X-Webhook-ID");

  const body = await request.text();
  const payload = JSON.parse(body);

  // Verify signature
  const secret = "your-webhook-secret-key"; // Retrieved from createWebhook
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (signature !== expectedSignature) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Process the webhook
  if (payload.type === "email.received") {
    console.log("New email received!");
    console.log("From:", payload.data.from.email);
    console.log("Subject:", payload.data.subject);
    console.log("Thread ID:", payload.data.thread_id);

    // Your business logic here
    await processIncomingEmail(payload.data);
  }

  return new Response("OK", { status: 200 });
}
```

### Auto-Reply Example

```typescript
const autoReplyHandler = async (webhookPayload: any) => {
  if (webhookPayload.type === "email.received") {
    const incomingEmail = webhookPayload.data;

    // Send auto-reply
    await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connection_id: "conn_123",
        from: "bot@gmail.com",
        to: incomingEmail.from.email,
        subject: `Re: ${incomingEmail.subject}`,
        text: `Thank you for your email. We'll get back to you soon!`,
        thread_id: incomingEmail.thread_id,
        in_reply_to: incomingEmail.headers["message-id"],
        references: incomingEmail.references || [],
      }),
    });
  }
};
```

## Connection Management

### List User Connections

```typescript
const getUserConnections = async (userId: string) => {
  const response = await fetch(`/api/connections?user_id=${userId}`);
  const data = await response.json();
  return data.connections;
};

// Usage
const connections = await getUserConnections("user_123");
connections.forEach((conn) => {
  console.log(`${conn.email} - ${conn.connection_type} (${conn.is_active ? "active" : "inactive"})`);
});
```

### Compare API vs SMTP

```typescript
const comparePerformance = async (connectionId: string) => {
  const testEmail = {
    connection_id: connectionId,
    from: "sender@gmail.com",
    to: "recipient@example.com",
    subject: "Performance Test",
    text: "Testing...",
  };

  // Test Gmail API
  const apiStart = Date.now();
  await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...testEmail, method: "api" }),
  });
  const apiTime = Date.now() - apiStart;

  // Test SMTP
  const smtpStart = Date.now();
  await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...testEmail, method: "smtp" }),
  });
  const smtpTime = Date.now() - smtpStart;

  console.log(`Gmail API: ${apiTime}ms`);
  console.log(`SMTP: ${smtpTime}ms`);
  console.log(`Winner: ${apiTime < smtpTime ? "Gmail API" : "SMTP"} (${Math.abs(apiTime - smtpTime)}ms faster)`);
};
```

## Advanced Use Cases

### Email Forwarding Service

```typescript
const emailForwarder = async (webhookPayload: any) => {
  if (webhookPayload.type === "email.received") {
    const incomingEmail = webhookPayload.data;

    // Forward to another address
    await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connection_id: "conn_123",
        from: "forwarder@gmail.com",
        to: "destination@example.com",
        subject: `Fwd: ${incomingEmail.subject}`,
        html: `
          <p><strong>Forwarded message:</strong></p>
          <p>From: ${incomingEmail.from.email}</p>
          <p>Date: ${incomingEmail.timestamp}</p>
          <hr>
          ${incomingEmail.html || incomingEmail.text}
        `,
      }),
    });
  }
};
```

### Email Newsletter Service

```typescript
const sendNewsletter = async (
  connectionId: string,
  subscribers: string[],
  content: { subject: string; html: string }
) => {
  const results = [];

  // Send to each subscriber
  for (const email of subscribers) {
    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: connectionId,
          from: "newsletter@gmail.com",
          to: email,
          subject: content.subject,
          html: content.html,
        }),
      });

      results.push({
        email,
        success: response.ok,
        response: await response.json(),
      });
    } catch (error) {
      results.push({ email, success: false, error });
    }
  }

  return results;
};
```

### Email Backup Service

```typescript
const backupEmails = async (connectionId: string) => {
  const threads = await getAllThreads(connectionId);
  const backup = [];

  for (const thread of threads) {
    const fullThread = await getThread(connectionId, thread.id);
    backup.push(fullThread);

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Save to file or database
  await fs.writeFile("email-backup.json", JSON.stringify(backup, null, 2));

  return {
    totalThreads: threads.length,
    totalMessages: backup.reduce((sum, t) => sum + t.messages.length, 0),
  };
};
```

## TypeScript Types

Import types for better type safety:

```typescript
import type {
  SendEmailRequest,
  SendEmailResponse,
  Thread,
  ThreadDetailResponse,
  WebhookPayload,
  Connection,
} from "@/lib/types";

const sendEmail = async (data: SendEmailRequest): Promise<SendEmailResponse> => {
  const response = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to send email");
  }

  return await response.json();
};
```

## Error Handling

Always handle errors appropriately:

```typescript
const sendEmailWithErrorHandling = async (data: SendEmailRequest) => {
  try {
    const response = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Send failed:", error.error);

      // Handle specific errors
      if (response.status === 404) {
        console.error("Connection not found");
      } else if (response.status === 400) {
        console.error("Invalid request:", error.details);
      }

      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Network error:", error);
    return null;
  }
};
```

## Testing

### Mock Webhook Testing

```typescript
// Test your webhook handler locally
const testWebhook = async () => {
  const mockPayload: WebhookPayload = {
    type: "email.received",
    id: "evt_test_123",
    timestamp: new Date().toISOString(),
    data: {
      id: "msg_test_123",
      from: { email: "test@example.com", name: "Test User" },
      to: [{ email: "you@gmail.com" }],
      subject: "Test Email",
      text: "This is a test",
      thread_id: "thread_test_123",
    },
  };

  await fetch("http://localhost:3000/api/your-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": "test-signature",
      "X-Webhook-ID": "webhook_123",
    },
    body: JSON.stringify(mockPayload),
  });
};
```

## Best Practices

1. **Store connection IDs securely** - Don't expose them to clients
2. **Rate limit your requests** - Both APIs have limits
3. **Handle token refresh** - Tokens expire and need refreshing
4. **Verify webhook signatures** - Always verify incoming webhooks
5. **Use appropriate method** - Choose API vs SMTP based on use case
6. **Monitor watch expirations** - Gmail API watches expire after 7 days
7. **Handle errors gracefully** - Network issues, API errors, etc.
8. **Log important events** - Useful for debugging and monitoring
9. **Respect user privacy** - Only access what's necessary
10. **Test thoroughly** - Both sending and receiving paths

## Resources

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Resend API Reference](https://resend.com/docs/api-reference)
- [Inbound.new Webhooks](https://docs.inbound.new/webhook)
- [Better Auth Docs](https://better-auth.com)
- [Drizzle ORM](https://orm.drizzle.team)
