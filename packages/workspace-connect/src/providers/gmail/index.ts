import { createProvider, createRoute } from "../../core/router";
import type { WorkspaceProvider } from "../../types";
import {
  createWatchHandler,
  createWatchRefreshHandler,
  createGmailPubSubHandler,
  type WatchManagementCallback,
  type WatchRefreshCallback,
  type GmailPubSubCallback,
} from "./handlers";

export * from "./service";
export * from "./handlers";

export interface GmailProviderOptions {
  cronSecret: string;
  onWatchManagement: WatchManagementCallback;
  onWatchRefresh: WatchRefreshCallback;
  onPubSubNotification: GmailPubSubCallback;
}

/**
 * Create a Gmail provider instance
 */
export function gmailProvider(options: GmailProviderOptions): WorkspaceProvider {
  const watchHandler = createWatchHandler(options.onWatchManagement);
  const refreshHandler = createWatchRefreshHandler(
    options.cronSecret,
    options.onWatchRefresh
  );
  const pubsubHandler = createGmailPubSubHandler(options.onPubSubNotification);

  return createProvider("gmail", [
    createRoute("POST", "watch", watchHandler),
    createRoute("DELETE", "watch", watchHandler),
    createRoute("GET", "cron/watch-refresh", refreshHandler),
    createRoute("POST", "providers/gmail", pubsubHandler),
  ]);
}

