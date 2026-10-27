import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WordAudit",
  description: "DOCX formázási audit"
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="hu"><body>{children}</body></html>;
}
