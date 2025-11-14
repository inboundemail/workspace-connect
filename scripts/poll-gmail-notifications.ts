#!/usr/bin/env node
/**
 * Gmail Notification Poller Script
 *
 * This script polls Google Cloud Pub/Sub for Gmail notifications
 * and processes them. Use this as a workaround for organization
 * policies that block Gmail API push notifications.
 *
 * Usage:
 *   npm run poll:once       # Poll once and exit
 *   npm run poll:start      # Poll continuously
 */

import { pollOnce, startPolling } from "../lib/services/gmail-pubsub-poller";

const mode = process.argv[2] || "once";

async function main() {
  console.log("Gmail Notification Poller");
  console.log("========================\n");

  if (mode === "continuous" || mode === "start") {
    console.log("Starting continuous polling (Ctrl+C to stop)...\n");
    await startPolling(10000); // Poll every 10 seconds
  } else {
    console.log("Polling once...\n");
    await pollOnce();
    console.log("\nDone!");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
