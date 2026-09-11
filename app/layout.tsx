import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "INK//:PLAY — Issue Zero",
  description: "A living publication for games, manga and anime.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-handbook-footer">
          <a href="/handbook">Community handbook</a>
        </footer>
      </body>
    </html>
  );
}
