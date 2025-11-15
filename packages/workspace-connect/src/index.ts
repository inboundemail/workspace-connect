/**
 * Workspace Connect SDK
 * 
 * Stateless Gmail watch service for any Node.js app
 */

// Core exports
export { GmailWatchService } from "./core/gmail-watch-service";
export type {
  GmailWatchServiceOptions,
  StartWatchParams,
  StopWatchParams,
  RefreshWatchParams,
} from "./core/gmail-watch-service";

// Type exports
export type {
  GoogleTokens,
  WatchInfo,
  EmailNotification,
  GoogleConfig,
  WorkspaceConnectHandlerOptions,
  EmailAddress,
} from "./types";

// Utility exports
export { parseEmailAddress, parseEmailAddresses } from "./core/utils";

// Next.js adapter (optional)
export { workspaceConnectHandler } from "./next";

