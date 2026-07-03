import { auth } from "@/auth";
import { getProfile, updateProfile } from "@/lib/profiles";
import { ensureUser } from "@/lib/users";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ensureUser(session.user);
  const profile = getProfile(session.user.id);
  return NextResponse.json({ ...session.user, ...profile });
}

const ALLOWED_FIELDS = ["username", "country", "favoriteTeam", "favoriteDriver"] as const;

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => (ALLOWED_FIELDS as readonly string[]).includes(k))
  );

  ensureUser(session.user);
  const updated = updateProfile(session.user.id, updates);
  return NextResponse.json(updated);
}
