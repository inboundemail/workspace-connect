/**
 * Next.js Route Handler for Workspace Connect
 */

import { GmailWatchService } from '../core/gmail-watch-service';
import type { WorkspaceConnectHandlerOptions } from '../types';

interface RouteParams {
  params: { slug: string[] };
}

export function workspaceConnectHandler(options: WorkspaceConnectHandlerOptions) {
  const {
    google,
    cronSecret,
    getTokens,
    onWatchStarted,
    onWatchStopped,
    onEmailReceived,
    getExpiringWatches,
    onWatchRefreshed,
  } = options;

  const gmailService = new GmailWatchService({
    clientId: google.clientId,
    clientSecret: google.clientSecret,
  });

  const topicName = `projects/${google.pubSubProjectId}/topics/${google.pubSubTopicName || 'gmail-notifications'}`;

  /**
   * POST /watch - Start watching an email
   */
  async function handleStartWatch(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { email?: string };
      const { email } = body;

      if (!email) {
        return Response.json({ error: 'email is required' }, { status: 400 });
      }

      // Get tokens from user's implementation
      const tokens = await getTokens(email);

      // Start watch via Gmail API
      const watch = await gmailService.startWatch({
        email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        topicName,
      });

      // Notify user via callback
      await onWatchStarted(watch);

      return Response.json({
        success: true,
        watch: {
          email: watch.email,
          expiration: watch.expiration.toISOString(),
          historyId: watch.historyId,
        },
      });
    } catch (error) {
      console.error('Error starting watch:', error);
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to start watch' },
        { status: 500 }
      );
    }
  }

  /**
   * DELETE /watch - Stop watching an email
   */
  async function handleStopWatch(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { email?: string };
      const { email } = body;

      if (!email) {
        return Response.json({ error: 'email is required' }, { status: 400 });
      }

      // Get tokens from user's implementation
      const tokens = await getTokens(email);

      // Stop watch via Gmail API
      await gmailService.stopWatch({
        email,
        accessToken: tokens.accessToken,
      });

      // Notify user via callback
      await onWatchStopped({ email });

      return Response.json({ success: true });
    } catch (error) {
      console.error('Error stopping watch:', error);
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to stop watch' },
        { status: 500 }
      );
    }
  }

  /**
   * POST /providers/gmail - Handle Pub/Sub webhook
   */
  async function handleGmailWebhook(request: Request): Promise<Response> {
    try {
      const payload = await request.json();

      // Parse Pub/Sub notification
      const notification = gmailService.parsePubSubNotification(payload);

      // Notify user via callback
      await onEmailReceived(notification);

      return Response.json({ success: true });
    } catch (error) {
      console.error('Error handling Gmail webhook:', error);
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to process notification' },
        { status: 500 }
      );
    }
  }

  /**
   * GET /cron/watch-refresh - Refresh expiring watches
   */
  async function handleWatchRefresh(request: Request): Promise<Response> {
    try {
      // Verify cron secret
      const auth = request.headers.get('authorization');
      if (auth !== `Bearer ${cronSecret}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Get expiring watches from user's implementation
      const expiringWatches = await getExpiringWatches();

      const results = [];

      for (const watch of expiringWatches) {
        try {
          // Get tokens
          const tokens = await getTokens(watch.email);

          // Refresh watch
          const refreshed = await gmailService.refreshWatch({
            email: watch.email,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            topicName,
          });

          // Notify user
          await onWatchRefreshed({
            email: watch.email,
            newExpiration: refreshed.expiration,
          });

          results.push({ email: watch.email, success: true });
        } catch (error) {
          console.error(`Failed to refresh watch for ${watch.email}:`, error);
          results.push({
            email: watch.email,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return Response.json({
        success: true,
        refreshed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      });
    } catch (error) {
      console.error('Error refreshing watches:', error);
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to refresh watches' },
        { status: 500 }
      );
    }
  }

  /**
   * Main route handler
   */
  async function handleRequest(request: Request, { params }: RouteParams): Promise<Response> {
    const slug = params.slug || [];
    const path = slug.join('/');
    const method = request.method;

    // Route: POST /watch
    if (method === 'POST' && path === 'watch') {
      return handleStartWatch(request);
    }

    // Route: DELETE /watch
    if (method === 'DELETE' && path === 'watch') {
      return handleStopWatch(request);
    }

    // Route: POST /providers/gmail
    if (method === 'POST' && path === 'providers/gmail') {
      return handleGmailWebhook(request);
    }

    // Route: GET /cron/watch-refresh
    if (method === 'GET' && path === 'cron/watch-refresh') {
      return handleWatchRefresh(request);
    }

    // Not found
    return Response.json(
      { error: `Route '${path}' not found` },
      { status: 404 }
    );
  }

  // Return Next.js route handlers
  return {
    GET: (request: Request, context: RouteParams) => handleRequest(request, context),
    POST: (request: Request, context: RouteParams) => handleRequest(request, context),
    DELETE: (request: Request, context: RouteParams) => handleRequest(request, context),
  };
}

