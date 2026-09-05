import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "E*NKI Avatar Runtime",
  description: "Moteur expérimental d’avatar-agent E*NKI en temps réel.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
