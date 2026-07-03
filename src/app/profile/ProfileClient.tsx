"use client";

import { useState } from "react";
import { Session } from "next-auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { UserProfile } from "@/lib/profiles";
import { COUNTRIES, F1_TEAMS } from "@/lib/countries";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  session: Session;
  initialProfile: UserProfile;
}

export default function ProfileClient({ session, initialProfile }: Props) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { user } = session;

  const [form, setForm] = useState<UserProfile>({
    username: initialProfile.username ?? "",
    country: initialProfile.country ?? "",
    favoriteTeam: initialProfile.favoriteTeam ?? "",
    favoriteDriver: initialProfile.favoriteDriver ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = (field: keyof UserProfile, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        // Brief confirmation, then back to the dashboard.
        setTimeout(() => router.push("/dashboard"), 900);
      }
    } finally {
      setSaving(false);
    }
  };

  const memberSince = (() => {
    const d = new Date();
    return d.toLocaleDateString(language === "es" ? "es-AR" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  })();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Back */}
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors text-sm mb-8"
        >
          <ArrowLeft size={16} />
          {t("profile.backToDashboard")}
        </button>

        {/* Header — Google data (read-only) */}
        <div className="flex items-center gap-4 mb-8">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? "Avatar"}
              width={72}
              height={72}
              className="rounded-full border-2 border-zinc-700"
            />
          ) : (
            <div className="w-[72px] h-[72px] rounded-full bg-zinc-800 flex items-center justify-center text-2xl font-bold text-zinc-400">
              {(user.name ?? "?")[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-zinc-100 truncate">
              {form.username || user.name}
            </h1>
            <p className="text-sm text-zinc-400 truncate">{user.email}</p>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">
                {user.tier === "pro" ? t("profile.pro") : t("profile.free")}
              </span>
              {user.role === "admin" && (
                <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded border border-primary/50 text-primary">
                  Admin
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="border border-zinc-800 rounded-xl p-5 space-y-5 bg-zinc-900/50">
            <h2 className="text-xs uppercase tracking-widest font-bold text-zinc-500">
              {t("profile.editSection")}
            </h2>

            {/* Username */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                {t("profile.displayName")}
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => handleChange("username", e.target.value)}
                placeholder={user.name ?? ""}
                maxLength={40}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <p className="text-[11px] text-zinc-600 mt-1">
                {t("profile.displayNameHint")}
              </p>
            </div>

            {/* Country */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                {t("profile.country")}
              </label>
              <div className="relative">
                {form.country && (
                  <img
                    src={`https://flagcdn.com/w20/${form.country}.png`}
                    alt=""
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-3 object-cover rounded-sm pointer-events-none"
                  />
                )}
                <select
                  value={form.country}
                  onChange={(e) => handleChange("country", e.target.value)}
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2 pr-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors appearance-none ${form.country ? "pl-9" : "pl-3"}`}
                >
                  <option value="">{t("profile.selectCountry")}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {language === "es" ? c.nameEs : c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Favorite team */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                {t("profile.favoriteTeam")}
              </label>
              <select
                value={form.favoriteTeam}
                onChange={(e) => handleChange("favoriteTeam", e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors appearance-none"
              >
                <option value="">{t("profile.selectTeam")}</option>
                {F1_TEAMS.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>

            {/* Favorite driver */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                {t("profile.favoriteDriver")}
              </label>
              <input
                type="text"
                value={form.favoriteDriver}
                onChange={(e) => handleChange("favoriteDriver", e.target.value)}
                placeholder={t("profile.favoriteDriverPlaceholder")}
                maxLength={30}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>
          </div>

          {/* Save button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold text-sm py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : saved ? (
              <>
                <Check size={15} />
                {t("profile.saved")}
              </>
            ) : (
              t("profile.save")
            )}
          </button>
        </form>

        {/* Google info footer */}
        <p className="text-center text-xs text-zinc-600 mt-6">
          {t("profile.googleNote")}
        </p>
      </div>
    </div>
  );
}
