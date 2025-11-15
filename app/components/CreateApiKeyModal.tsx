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

interface CreateApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { name: string; expiresIn?: number }) => Promise<{ key: string }>;
  isCreating: boolean;
}

export function CreateApiKeyModal({
  open,
  onOpenChange,
  onCreate,
  isCreating,
}: CreateApiKeyModalProps) {
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreatedKey(null);

    if (!name.trim()) {
      setError("Please enter a name for the API key");
      return;
    }

    try {
      const expiresIn = expiresInDays
        ? Number(expiresInDays) * 24 * 60 * 60 // Convert days to seconds
        : undefined;

      const result = await onCreate({
        name: name.trim(),
        expiresIn,
      });

      setCreatedKey(result.key);
      setName("");
      setExpiresInDays("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setName("");
    setExpiresInDays("");
    setError(null);
    setCreatedKey(null);
  };

  const copyToClipboard = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Create a new API key for service-to-service authentication. The key will only be shown once.
          </DialogDescription>
        </DialogHeader>
        {createdKey ? (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <p className="mb-2 text-sm font-medium text-green-900 dark:text-green-100">
                API Key Created Successfully!
              </p>
              <p className="mb-3 text-xs text-green-700 dark:text-green-300">
                Copy this key now. You won't be able to see it again.
              </p>
              <div className="flex items-start gap-2">
                <code className="flex-1 min-w-0 break-all rounded bg-white px-3 py-2 text-xs font-mono text-green-900 dark:bg-zinc-800 dark:text-green-100">
                  {createdKey}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  className="shrink-0"
                >
                  Copy
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Production Service"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  disabled={isCreating}
                  className={error && !name.trim() ? "border-red-500" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  A descriptive name to identify this API key
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="expiresIn">Expires In (Days)</Label>
                <Input
                  id="expiresIn"
                  type="number"
                  placeholder="365"
                  min="1"
                  value={expiresInDays}
                  onChange={(e) =>
                    setExpiresInDays(e.target.value ? Number(e.target.value) : "")
                  }
                  disabled={isCreating}
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Number of days until the key expires. Leave empty for no expiration.
                </p>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating || !name.trim()}>
                {isCreating ? "Creating..." : "Create API Key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

