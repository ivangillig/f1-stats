export default function Footer() {
  return (
    <footer className="w-full border-t border-zinc-800 bg-zinc-950 py-3 px-4">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>
          Made with <span className="text-red-500">♥</span> by{" "}
          <a
            href="https://github.com"
            className="text-blue-400 hover:underline"
          >
            Developer
          </a>
        </span>
        <span className="text-zinc-700">•</span>
        <a href="https://github.com" className="text-blue-400 hover:underline">
          GitHub
        </a>
        <span className="text-zinc-700">•</span>
        <span>Version: 1.0.0</span>
      </div>
      <div className="mt-2 text-center text-[10px] text-zinc-600">
        This project/website is unofficial and is not associated in any way with
        the Formula 1 companies. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE
        WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trademarks of
        Formula One Licensing B.V.
      </div>
    </footer>
  );
}
