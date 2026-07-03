import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profiles";
import { ensureUser } from "@/lib/users";
import ProfileClient from "./ProfileClient";

export const metadata = { title: "Mi Perfil" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  ensureUser(session.user);
  const profile = getProfile(session.user.id);

  return <ProfileClient session={session} initialProfile={profile} />;
}
