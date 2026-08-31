"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const executeLogin = async (loginEmail: string, loginPass: string) => {
    setError(null);
    if (!loginEmail || !loginPass) {
      setError("Por favor completa tu correo y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(
          data.error?.message ||
            "No fue posible iniciar sesión. Verifica tus credenciales."
        );
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Ocurrió un error de conexión al servidor. Inténtalo nuevamente.");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeLogin(email, password);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-md border border-slate-200">
        <div className="text-center mb-8">
          <img
            src="/icon.png"
            alt="Maxiofertas"
            className="inline-block h-16 w-16 mb-3 object-contain rounded-2xl shadow-sm border border-slate-100 p-1 bg-white"
          />
          <h1 className="text-xl font-bold text-slate-900">
            Sistema de Gestión de Facturas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Maxiofertas — Acceso Interno Autorizado
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
            >
              Correo Electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@maxiofertas.cl"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            {loading ? "Iniciando sesión..." : "Ingresar al Sistema"}
          </button>
        </form>

        {process.env.NODE_ENV === "development" && (
          <div className="mt-6 rounded-xl bg-amber-50 p-4 border border-amber-200">
            <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 mb-2">
              <span>🧪</span>
              <span>Acceso Rápido QA Local (1 Clic)</span>
            </div>
            <p className="text-[11px] text-amber-800 mb-3">
              Selecciona un rol para iniciar sesión instantáneamente:
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { email: "solicitante@maxiofertas.cl", label: "🏢 Solicitante Central", desc: "Bodega Santiago" },
                { email: "solicitante.norte@maxiofertas.cl", label: "🏢 Solicitante Norte", desc: "Bodega Norte" },
                { email: "ejecutor@maxiofertas.cl", label: "⚙️ Ejecutor de Facturación", desc: "Mesa de Facturación" },
                { email: "jefatura@maxiofertas.cl", label: "📊 Jefatura de Operaciones", desc: "Reportes / Estadísticas" },
                { email: "admin@maxiofertas.cl", label: "🛡️ Administrador", desc: "Acceso Total" },
              ].map((q) => (
                <button
                  key={q.email}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setEmail(q.email);
                    setPassword("QA_password123!");
                    executeLogin(q.email, "QA_password123!");
                  }}
                  className="flex items-center justify-between rounded-lg bg-white p-2 border border-amber-200 hover:border-amber-400 text-left text-xs text-slate-800 shadow-2xs hover:bg-amber-100/50 transition-all disabled:opacity-50"
                >
                  <span className="font-semibold text-slate-900">{q.label}</span>
                  <span className="text-[10px] text-slate-500">{q.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
          Acceso exclusivo para personal autorizado de Maxiofertas.
        </div>
      </div>
    </main>
  );
}
