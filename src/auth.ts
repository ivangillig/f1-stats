import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";

const adminEmails = (process.env.AUTH_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  callbacks: {
    jwt({ token, account }) {
      if (account) {
        // First sign-in. Pin the user id to the provider's stable account id
        // (Google's `sub`) — otherwise NextAuth generates a fresh random id per
        // login and nothing keyed by user id (profiles, etc.) matches next time.
        token.sub = account.providerAccountId;
        token.role = adminEmails.includes(token.email ?? "") ? "admin" : "user";
        token.tier = "free";
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.role = (token.role as string) ?? "user";
      session.user.tier = (token.tier as string) ?? "free";
      return session;
    },
  },
});
