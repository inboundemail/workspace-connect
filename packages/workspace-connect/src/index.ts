/**
 * Workspace Connect SDK
 * 
 * Universal email provider SDK for Gmail, Outlook, and more
 */

// Core exports
export * from "./core/router";
export * from "./core/utils";

// Type exports
export * from "./types";

// Provider exports (selective to avoid conflicts)
export { gmailProvider, GmailService } from "./providers/gmail";
export type {
  GmailServiceOptions,
  WatchManagementCallback,
  WatchRefreshCallback,
  GmailPubSubCallback,
} from "./providers/gmail";

// Re-export main entry points for convenience
export { workspaceConnectHandler } from "./next";
export { createConnector, WorkspaceConnector } from "./server";
export type { ConnectorOptions, ConnectorResponse } from "./server";

