import type { Metadata } from "next";
import "./globals.css";
import { Geist, Noto_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";

const notoSansHeading = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans" });

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "NativeNote — AI Writing Coach",
  description: "Viết tiếng Anh tự nhiên hơn qua phản hồi chủ động và luyện tập theo ngữ cảnh.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning className={cn("font-sans", geist.variable, notoSansHeading.variable)}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delay={400}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
