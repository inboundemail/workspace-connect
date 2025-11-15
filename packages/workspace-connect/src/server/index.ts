/**
 * Server-side REST client for Workspace Connect
 * 
 * @example
 * ```ts
 * import { createConnector } from "workspace-connect/server";
 * 
 * const connector = createConnector({
 *   baseUrl: "https://your-app.com",
 *   accessToken: "your-api-key-or-token",
 * });
 * 
 * // Start watching a connection
 * await connector.startWatch("conn_123");
 * 
 * // Stop watching a connection
 * await connector.stopWatch("conn_123");
 * ```
 */

export interface ConnectorOptions {
  baseUrl: string;
  accessToken?: string;
}

export interface ConnectorResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export class WorkspaceConnector {
  private baseUrl: string;
  private accessToken?: string;

  constructor(options: ConnectorOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.accessToken = options.accessToken;
  }

  private async request<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<ConnectorResponse<T>> {
    const url = `${this.baseUrl}/api/workspace-connect${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: (data as { error?: string }).error || `Request failed with status ${response.status}`,
        };
      }

      return {
        success: true,
        data: data as T | undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Request failed",
      };
    }
  }

  /**
   * Start watching a Gmail connection for new emails
   */
  async startWatch(connectionId: string): Promise<ConnectorResponse> {
    return this.request("/watch", {
      method: "POST",
      body: JSON.stringify({ connectionId }),
    });
  }

  /**
   * Stop watching a Gmail connection
   */
  async stopWatch(connectionId: string): Promise<ConnectorResponse> {
    return this.request("/watch", {
      method: "DELETE",
      body: JSON.stringify({ connectionId }),
    });
  }

  /**
   * Trigger watch refresh (typically called by cron)
   * Requires CRON_SECRET in Authorization header
   */
  async refreshWatches(cronSecret: string): Promise<ConnectorResponse> {
    return this.request("/cron/watch-refresh", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });
  }

  /**
   * Send a Gmail Pub/Sub notification (for testing)
   */
  async sendGmailNotification(params: {
    emailAddress: string;
    historyId: string;
  }): Promise<ConnectorResponse> {
    const data = {
      message: {
        data: Buffer.from(JSON.stringify(params)).toString("base64"),
        messageId: `test-${Date.now()}`,
        publishTime: new Date().toISOString(),
      },
    };

    return this.request("/providers/gmail", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

/**
 * Create a new Workspace Connector client
 */
export function createConnector(options: ConnectorOptions): WorkspaceConnector {
  return new WorkspaceConnector(options);
}

