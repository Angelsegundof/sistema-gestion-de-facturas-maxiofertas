import type { Metadata } from "next";
import "./globals.css";
import DevQaSwitcher from "@/components/DevQaSwitcher";

export const metadata: Metadata = {
  title: "Sistema de Gestión de Facturas — Maxiofertas",
  description: "Sistema interno independiente de gestión y emisión de facturas y notas de crédito de Maxiofertas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900">
        {children}
        <DevQaSwitcher />
      </body>
    </html>
  );
}
