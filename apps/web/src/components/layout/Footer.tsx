export function Footer() {
  return (
    <footer className="w-full py-6 mt-auto border-t border-white/5 bg-slate-950/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between text-slate-500 text-sm">
        <div className="mb-4 md:mb-0">
          Army Forge Compare | {new Date().getFullYear()}
        </div>
        <div className="flex gap-6">
          <a
            href="https://github.com/joe-lloyd/army-forge-scraper"
            target="_blank"
            rel="noreferrer"
            className="hover:text-sky-400 transition-colors"
          >
            GitHub Repository
          </a>
          <a
            href="https://github.com/joe-lloyd/army-forge-scraper/issues"
            target="_blank"
            rel="noreferrer"
            className="hover:text-sky-400 transition-colors"
          >
            Report an Issue
          </a>
        </div>
      </div>
    </footer>
  );
}
