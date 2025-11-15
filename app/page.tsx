"use client";

import { useSession, signIn, signOut } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import WorkspaceConnectLogo from "./components/WorkspaceConnectLogo";
import {
  Table,
  TableHeader,
  TableHeaderRow,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "./components/Table";
import { CreateConnectionModal } from "./components/CreateConnectionModal";
import { CreateWebhookModal } from "./components/CreateWebhookModal";
import { CreateApiKeyModal } from "./components/CreateApiKeyModal";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

type Connection = {
  id: string;
  email: string;
  connection_type: string;
  is_active: boolean;
  last_synced_at: string | null;
  watch_expiration: string | null;
  created_at: string;
  updated_at: string;
};

type Webhook = {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  connection_id: string;
  connection_email?: string;
};

type ApiKey = {
  id: string;
  name: string | null;
  expiresAt: string | null;
  createdAt: string;
  start?: string; // First few characters of the key
  prefix?: string; // API key prefix
};

export default function Home() {
  const { data: session, isPending } = useSession();
  
  // Modal state
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);

  // Connection creation state
  const [creatingConnection, setCreatingConnection] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [creatingApiKey, setCreatingApiKey] = useState(false);

  // Connections list state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);

  // Webhooks list state
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);

  // API Keys list state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);

  const handleGoogleSignIn = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: "/",
    });
  };

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
      },
    });
  };

  const fetchConnections = async () => {
    if (!session?.user.id) return;

    setLoadingConnections(true);
    try {
      const response = await fetch(
        `/api/connections?user_id=${session.user.id}`,
        {
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setConnections(data.connections || []);
      }
    } catch (error) {
      console.error("Failed to fetch connections:", error);
    } finally {
      setLoadingConnections(false);
    }
  };

  const fetchWebhooks = async () => {
    if (!session?.user.id || connections.length === 0) return;

    setLoadingWebhooks(true);
    try {
      const allWebhooks: Webhook[] = [];
      
      // Fetch webhooks for each connection
      for (const connection of connections) {
        try {
          const response = await fetch(
            `/api/webhooks?connection_id=${connection.id}`,
            {
              credentials: "include",
            }
          );

          if (response.ok) {
            const data = await response.json();
            const connectionWebhooks = (data.webhooks || []).map((wh: any) => ({
              ...wh,
              connection_id: connection.id,
              connection_email: connection.email,
            }));
            allWebhooks.push(...connectionWebhooks);
          }
        } catch (error) {
          console.error(`Failed to fetch webhooks for connection ${connection.id}:`, error);
        }
      }

      setWebhooks(allWebhooks);
    } catch (error) {
      console.error("Failed to fetch webhooks:", error);
    } finally {
      setLoadingWebhooks(false);
    }
  };

  useEffect(() => {
    if (session?.user.id) {
      fetchConnections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  useEffect(() => {
    if (connections.length > 0) {
      fetchWebhooks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections]);

  const fetchApiKeys = async () => {
    if (!session?.user.id) return;

    setLoadingApiKeys(true);
    try {
      const response = await fetch("/api/api-keys", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.apiKeys || []);
      }
    } catch (error) {
      console.error("Failed to fetch API keys:", error);
    } finally {
      setLoadingApiKeys(false);
    }
  };

  useEffect(() => {
    if (session?.user.id) {
      fetchApiKeys();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const createConnection = async (email: string) => {
    if (!session?.user.id) {
      throw new Error("You must be signed in to create a connection");
    }

    setCreatingConnection(true);

    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          user_id: session.user.id,
          email,
          connection_type: "api",
          start_watching: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create connection");
      }

      // Refresh connections list
      await fetchConnections();
      // Webhooks will be refreshed automatically via useEffect
    } finally {
      setCreatingConnection(false);
    }
  };

  const createWebhook = async (webhookData: {
    connection_id: string;
    url: string;
    events: string[];
    secret?: string;
  }) => {
    if (!session?.user.id) {
      throw new Error("You must be signed in to create a webhook");
    }

    setCreatingWebhook(true);

    try {
      const response = await fetch("/api/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          connection_id: webhookData.connection_id,
          url: webhookData.url,
          events: webhookData.events,
          secret: webhookData.secret,
          is_active: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create webhook");
      }

      // Refresh webhooks list
      await fetchWebhooks();
    } finally {
      setCreatingWebhook(false);
    }
  };

  const createApiKey = async (data: { name: string; expiresIn?: number }) => {
    if (!session?.user.id) {
      throw new Error("You must be signed in to create an API key");
    }

    setCreatingApiKey(true);

    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create API key");
      }

      // Refresh API keys list
      await fetchApiKeys();
      return { key: result.key };
    } finally {
      setCreatingApiKey(false);
    }
  };

  const deleteApiKey = async (keyId: string) => {
    if (!session?.user.id) {
      throw new Error("You must be signed in to delete an API key");
    }

    try {
      const response = await fetch(`/api/api-keys?id=${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete API key");
      }

      // Refresh API keys list
      await fetchApiKeys();
    } catch (error) {
      console.error("Failed to delete API key:", error);
      throw error;
    }
  };

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-lg text-zinc-600 dark:text-zinc-400">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      {session ? (
        <div className="mx-auto max-w-4xl px-4 py-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <WorkspaceConnectLogo width={35} height={35} />
              </div>
              <div className="flex flex-col">
                <h1 className="font-heading text-xl font-semibold text-black dark:text-zinc-50">
                  Workspace Connect
                </h1>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {session.user.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
            >
              Sign Out
            </button>
          </div>

          {/* Configured Connections Card */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-black dark:text-zinc-50">
                  Configured Email Addresses
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Gmail accounts connected to your workspace
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setConnectionModalOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Connection
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setWebhookModalOpen(true)}
                  disabled={connections.length === 0}
                >
                  <Plus className="h-4 w-4" />
                  Add Webhook
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {loadingConnections ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Loading...
                </p>
              </div>
            ) : connections.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No email addresses configured yet
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableHeaderRow>
                    <TableHeaderCell>Email</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Watch Status</TableHeaderCell>
                    <TableHeaderCell>Expiration</TableHeaderCell>
                  </TableHeaderRow>
                </TableHeader>
                <TableBody>
                  {connections.map((connection) => (
                    <TableRow key={connection.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="text-sm font-medium text-black dark:text-zinc-50">
                          {connection.email}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            connection.is_active
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                              : "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
                          }`}
                        >
                          {connection.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {connection.watch_expiration ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              new Date(connection.watch_expiration) > new Date()
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                                : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100"
                            }`}
                          >
                            {new Date(connection.watch_expiration) > new Date()
                              ? "Watch Active"
                              : "Watch Expired"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
                            No Watch
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                        {connection.watch_expiration ? (
                          <>
                            {new Date(connection.watch_expiration) > new Date()
                              ? `Expires: ${new Date(connection.watch_expiration).toLocaleDateString()} ${new Date(connection.watch_expiration).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                              : `Expired: ${new Date(connection.watch_expiration).toLocaleDateString()} ${new Date(connection.watch_expiration).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          </>
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-500">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Configured Webhooks Card */}
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-black dark:text-zinc-50">
                  Configured Webhooks
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Webhook endpoints for email notifications
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setWebhookModalOpen(true)}
                disabled={connections.length === 0}
              >
                <Plus className="h-4 w-4" />
                Add Webhook
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {loadingWebhooks ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Loading...
                </p>
              </div>
            ) : webhooks.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No webhooks configured yet
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableHeaderRow>
                    <TableHeaderCell>Connection</TableHeaderCell>
                    <TableHeaderCell>URL</TableHeaderCell>
                    <TableHeaderCell>Events</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                  </TableHeaderRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map((webhook) => (
                    <TableRow key={webhook.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="text-sm font-medium text-black dark:text-zinc-50">
                          {webhook.connection_email || webhook.connection_id}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400 break-all">
                          {webhook.url}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {webhook.events.map((event, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                            >
                              {event}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            webhook.is_active
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                              : "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
                          }`}
                        >
                          {webhook.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                        {new Date(webhook.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* API Keys Card */}
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-black dark:text-zinc-50">
                  API Keys
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Service-to-service authentication keys
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setApiKeyModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add API Key
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {loadingApiKeys ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Loading...
                </p>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No API keys configured yet
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableHeaderRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Key Preview</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell>Expires</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                  </TableHeaderRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((apiKey) => (
                    <TableRow key={apiKey.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="text-sm font-medium text-black dark:text-zinc-50">
                          {apiKey.name || "Unnamed"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <code className="text-xs text-zinc-600 dark:text-zinc-400">
                          {apiKey.start || apiKey.prefix || apiKey.id.slice(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                        {new Date(apiKey.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                        {apiKey.expiresAt ? (
                          new Date(apiKey.expiresAt) > new Date() ? (
                            new Date(apiKey.expiresAt).toLocaleDateString()
                          ) : (
                            <span className="text-red-600 dark:text-red-400">Expired</span>
                          )
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-500">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (
                              confirm(
                                "Are you sure you want to delete this API key? This action cannot be undone."
                              )
                            ) {
                              try {
                                await deleteApiKey(apiKey.id);
                              } catch (error) {
                                alert(
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to delete API key"
                                );
                              }
                            }
                          }}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Modals */}
          <CreateConnectionModal
            open={connectionModalOpen}
            onOpenChange={setConnectionModalOpen}
            onCreate={createConnection}
            isCreating={creatingConnection}
          />
          <CreateWebhookModal
            open={webhookModalOpen}
            onOpenChange={setWebhookModalOpen}
            onCreate={createWebhook}
            isCreating={creatingWebhook}
            connections={connections.map((c) => ({ id: c.id, email: c.email }))}
          />
          <CreateApiKeyModal
            open={apiKeyModalOpen}
            onOpenChange={setApiKeyModalOpen}
            onCreate={createApiKey}
            isCreating={creatingApiKey}
          />
        </div>
      ) : (
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <WorkspaceConnectLogo width={100} height={100} />
            <div className="flex flex-col items-center gap-4 text-center">
              <h1 className="font-heading text-3xl font-semibold text-black dark:text-zinc-50">
                Workspace Connect
              </h1>
              <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
                Sign in with your Google account to get started
              </p>
            </div>
            <button
              onClick={handleGoogleSignIn}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-white px-6 font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 transition-all hover:bg-zinc-50 hover:shadow-md dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-700"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
