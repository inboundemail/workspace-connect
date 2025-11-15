import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apiKey: schema.apiKey,
      apikey: schema.apiKey, // Also provide lowercase version for Better Auth compatibility
    },
  }),
  emailAndPassword: {
    enabled: false, // We're only using Google OAuth
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      // Request Gmail API scopes for full access
      // This allows us to read, send, and manage emails
      scope: [
        "openid",
        "profile",
        "email",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.labels",
      ],
      // Alternative: use full mail.google.com scope for IMAP/SMTP
      // scope: ["openid", "profile", "email", "https://mail.google.com/"],
      // Store tokens for later use with Gmail API
      accessType: "offline", // Get refresh token
      prompt: "consent", // Force consent screen to get refresh token
    },
  },
  plugins: [
    apiKey({
      // API keys for service-to-service authentication
      // Use this for microservice deployments
    }),
  ],
  secret: process.env.BETTER_AUTH_SECRET || "",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
});

export type Session = typeof auth.$Infer.Session;
