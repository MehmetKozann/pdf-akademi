import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AkademikAI — Yapay Zeka Destekli Akıllı Çalışma ve Sınav Platformu",
  description:
    "Ders PDF'lerinizi yükleyin; belgeye dayalı kapsamlı ders notları, klasik ve çoktan seçmeli sorular, deneme sınavları ve kaynak referanslı YZ çalışma asistanı ile sınavlara hazırlanın.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="font-sans antialiased selection:bg-[#FF6B5B]/25 selection:text-[#14213D]">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
