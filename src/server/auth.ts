import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import {
  getUserByEmail,
  isAccountLocked,
  incrementFailedLogins,
  resetFailedLogins,
  verifyPassword,
} from "@/server/services/user-service";

// ---------------------------------------------------------------------------
// TypeScript augmentation
// ---------------------------------------------------------------------------

declare module "next-auth" {
  interface User {
    role: string;
    mustChangePassword: boolean;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      mustChangePassword: boolean;
      organizationId: string;
    } & DefaultSession["user"];
  }
}

// JWT augmentation lives in @auth/core/jwt in v5
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    mustChangePassword: boolean;
    organizationId: string;
  }
}

// ---------------------------------------------------------------------------
// NextAuth v5 configuration
// ---------------------------------------------------------------------------

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (rawCredentials) => {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await getUserByEmail(email);

        if (!user || user.deletedAt || user.employmentStatus === "terminated") {
          return null;
        }

        if (isAccountLocked(user)) {
          throw new Error("ACCOUNT_LOCKED");
        }

        const passwordValid = await verifyPassword(password, user.passwordHash);

        if (!passwordValid) {
          await incrementFailedLogins(user.id);
          return null;
        }

        await resetFailedLogins(user.id);

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          organizationId: user.organizationId,
        };
      },
    }),
  ],

  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.organizationId = (user as unknown as { organizationId: string }).organizationId;
      }
      if (trigger === "update" && session?.user?.mustChangePassword !== undefined) {
        token.mustChangePassword = session.user.mustChangePassword as boolean;
      }
      return token;
    },

    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.mustChangePassword = token.mustChangePassword as boolean;
      session.user.organizationId = token.organizationId as string;
      return session;
    },
  },
});
