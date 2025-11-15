/**
 * Gmail Watch Service - Stateless Gmail API wrapper
 */

import { google } from 'googleapis';
import type { GoogleTokens, WatchInfo } from '../types';

export interface GmailWatchServiceOptions {
  clientId: string;
  clientSecret: string;
}

export interface StartWatchParams {
  email: string;
  accessToken: string;
  refreshToken: string;
  topicName: string; // e.g., "projects/PROJECT_ID/topics/gmail-notifications"
}

export interface StopWatchParams {
  email: string;
  accessToken: string;
}

export interface RefreshWatchParams {
  email: string;
  accessToken: string;
  refreshToken: string;
  topicName: string;
}

export class GmailWatchService {
  private clientId: string;
  private clientSecret: string;

  constructor(options: GmailWatchServiceOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  /**
   * Start watching a Gmail account
   */
  async startWatch(params: StartWatchParams): Promise<WatchInfo> {
    const gmail = this.createGmailClient(params.accessToken, params.refreshToken);

    try {
      const response = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: params.topicName,
          labelIds: ['INBOX'],
          labelFilterAction: 'include',
        },
      });

      return {
        email: params.email,
        watchId: response.data.historyId || undefined,
        expiration: new Date(parseInt(response.data.expiration!)),
        historyId: response.data.historyId!,
      };
    } catch (error) {
      console.error('Failed to start Gmail watch:', error);
      throw new Error(`Failed to start watch for ${params.email}: ${error}`);
    }
  }

  /**
   * Stop watching a Gmail account
   */
  async stopWatch(params: StopWatchParams): Promise<void> {
    const gmail = this.createGmailClient(params.accessToken, '');

    try {
      await gmail.users.stop({ userId: 'me' });
    } catch (error) {
      console.error('Failed to stop Gmail watch:', error);
      throw new Error(`Failed to stop watch for ${params.email}: ${error}`);
    }
  }

  /**
   * Refresh an existing watch (extends expiration)
   */
  async refreshWatch(params: RefreshWatchParams): Promise<WatchInfo> {
    // Refreshing is the same as starting a new watch
    return this.startWatch(params);
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    const oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      return {
        accessToken: credentials.access_token!,
        refreshToken: credentials.refresh_token || refreshToken,
      };
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      throw new Error('Failed to refresh Google access token');
    }
  }

  /**
   * Parse Pub/Sub notification message
   */
  parsePubSubNotification(payload: any): { emailAddress: string; historyId: string } {
    if (!payload.message?.data) {
      throw new Error('Invalid Pub/Sub message format');
    }

    const decoded = Buffer.from(payload.message.data, 'base64').toString('utf-8');
    const data = JSON.parse(decoded);

    if (!data.emailAddress || !data.historyId) {
      throw new Error('Invalid Gmail notification data');
    }

    return {
      emailAddress: data.emailAddress,
      historyId: data.historyId,
    };
  }

  /**
   * Create Gmail API client with tokens
   */
  private createGmailClient(accessToken: string, refreshToken: string) {
    const oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }
}

