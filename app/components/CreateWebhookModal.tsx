"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateWebhookModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    connection_id: string;
    url: string;
    events: string[];
    secret?: string;
  }) => Promise<void>;
  isCreating: boolean;
  connections: Array<{ id: string; email: string }>;
}

export function CreateWebhookModal({
  open,
  onOpenChange,
  onCreate,
  isCreating,
  connections,
}: CreateWebhookModalProps) {
  const [connectionId, setConnectionId] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["email.received"]);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!connectionId) {
      setError("Please select a connection");
      return;
    }

    if (!url.trim()) {
      setError("Please enter a webhook URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(url.trim());
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    if (events.length === 0) {
      setError("Please select at least one event");
      return;
    }

    try {
      await onCreate({
        connection_id: connectionId,
        url: url.trim(),
        events,
        secret: secret.trim() || undefined,
      });
      setConnectionId("");
      setUrl("");
      setEvents(["email.received"]);
      setSecret("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    }
  };

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Webhook</DialogTitle>
          <DialogDescription>
            Configure a webhook endpoint to receive email notifications. Select a connection and enter your webhook URL.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="connection">Connection</Label>
              <select
                id="connection"
                value={connectionId}
                onChange={(e) => {
                  setConnectionId(e.target.value);
                  setError(null);
                }}
                disabled={isCreating}
                className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  error && !connectionId ? "border-red-500" : ""
                }`}
              >
                <option value="">Select a connection</option>
                {connections.map((conn) => (
                  <option key={conn.id} value={conn.id}>
                    {conn.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="url">Webhook URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://your-domain.com/webhook"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                disabled={isCreating}
                className={error && !url.trim() ? "border-red-500" : ""}
              />
            </div>

            <div className="grid gap-2">
              <Label>Events</Label>
              <div className="space-y-2">
                {["email.received", "email.sent"].map((event) => (
                  <label
                    key={event}
                    className="flex items-center space-x-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={events.includes(event)}
                      onChange={() => toggleEvent(event)}
                      disabled={isCreating}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm">{event}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="secret">Secret (Optional)</Label>
              <Input
                id="secret"
                type="text"
                placeholder="Leave empty to auto-generate"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground">
                A secret key for verifying webhook requests. If left empty, one will be generated automatically.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setConnectionId("");
                setUrl("");
                setEvents(["email.received"]);
                setSecret("");
                setError(null);
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating || !connectionId || !url.trim() || events.length === 0}
            >
              {isCreating ? "Creating..." : "Create Webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

