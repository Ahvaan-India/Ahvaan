import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Ahvaan",
  description: "Ahvaan  Kolkata heat-risk command center",
};

import { WardProvider } from "@/lib/wardContext";
import { NavProvider } from "@/lib/navContext";
import { ChatbotWidget } from "@/components/ChatbotWidget";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("ahvaan-theme");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;document.documentElement.classList.toggle("dark",t==="dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className={archivo.variable}>
        <WardProvider>
          <NavProvider>{children}</NavProvider>
          <ChatbotWidget />
        </WardProvider>
      </body>
    </html>
  );
}
