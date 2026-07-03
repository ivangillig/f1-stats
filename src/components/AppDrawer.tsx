"use client";

import { useEffect } from "react";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, BarChart2, GitCompare, UserCircle, ChevronLeft, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
}

const DRAWER_WIDTH = 260;

const LANGUAGES = [
  { code: "es", label: "Es", countryCode: "ar" },
  { code: "en", label: "En", countryCode: "gb" },
] as const;

export default function AppDrawer({ open, onClose }: AppDrawerProps) {
  const { language, setLanguage, t } = useLanguage();
  const { data: session, status } = useSession();

  const navItems: Array<{
    icon: React.ElementType;
    label: string;
    href?: string;
    active?: boolean;
    soon?: boolean;
  }> = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", active: true },
    { icon: BarChart2,       label: t("drawer.stats"),       soon: true },
    { icon: GitCompare,      label: t("drawer.comparisons"), soon: true },
  ];

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          initial={{ width: 0 }}
          animate={{ width: DRAWER_WIDTH }}
          exit={{ width: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 38 }}
          className="flex-shrink-0 overflow-hidden border-r border-zinc-800 bg-zinc-950"
        >
          <div className="flex flex-col h-full" style={{ width: DRAWER_WIDTH }}>
            {/* Nav items */}
            <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
              {navItems.map((item) => {
                const isDisabled = "soon" in item && item.soon;
                const isActive = "active" in item && item.active;

                if (isDisabled) {
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-600 cursor-default select-none whitespace-nowrap"
                    >
                      <item.icon size={16} className="text-zinc-700 shrink-0" />
                      <span>{item.label}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-widest font-bold text-zinc-700 border border-zinc-800 rounded px-1.5 py-0.5">
                        {t("drawer.soon")}
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href ?? "#"}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                    }`}
                  >
                    <item.icon
                      size={16}
                      className={isActive ? "text-primary shrink-0" : "text-zinc-500 shrink-0"}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="border-t border-zinc-800">
              {/* User section */}
              <div className="px-4 py-3 border-b border-zinc-800/60">
                {status === "loading" ? (
                  <div className="h-9 bg-zinc-800/60 rounded-lg animate-pulse" />
                ) : session?.user ? (
                  <>
                    {/* Logged in */}
                    <div className="flex items-center gap-2.5 mb-2.5">
                      {session.user.image ? (
                        <Image
                          src={session.user.image}
                          alt={session.user.name ?? ""}
                          width={32}
                          height={32}
                          className="rounded-full border border-zinc-700 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                          {(session.user.name ?? "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-200 truncate">
                          {session.user.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {session.user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Link
                        href="/profile"
                        onClick={onClose}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
                      >
                        <UserCircle size={13} />
                        {t("auth.myProfile")}
                      </Link>
                      <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                      >
                        <LogOut size={13} />
                        {t("auth.signOut")}
                      </button>
                    </div>
                  </>
                ) : (
                  /* Not logged in */
                  <button
                    onClick={() => signIn("google", { callbackUrl: "/profile" })}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
                  >
                    <LogIn size={15} className="text-zinc-400" />
                    {t("auth.signIn")}
                  </button>
                )}
              </div>

              {/* Language switcher */}
              <div className="px-4 py-3 flex items-center gap-2 border-b border-zinc-800/60">
                <span className="text-xs text-zinc-500 whitespace-nowrap mr-1">{t("drawer.language")}</span>
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      language === lang.code
                        ? "bg-zinc-700 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <img
                      src={`https://flagcdn.com/w20/${lang.countryCode}.png`}
                      alt={lang.label}
                      className="w-4 h-3 object-cover rounded-sm"
                    />
                    {lang.label}
                  </button>
                ))}
              </div>

              {/* Version + close */}
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-xs text-zinc-600 whitespace-nowrap">F1 RaceHub · Beta</p>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                  aria-label="Cerrar menú"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
