"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
  warehouseId: string | null;
}

export default function DevQaSwitcher() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/v1/auth/session");
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.success && json.data?.user) {
            setCurrentUser(json.data.user);
            return;
          }
        }
        if (isMounted) setCurrentUser(null);
      } catch {
        if (isMounted) setCurrentUser(null);
      }
    };

    fetchSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Strictly disabled in production
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const handleSwitchUser = async (email: string) => {
    setLoadingEmail(email);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "QA_password123!" }),
      });
      if (res.ok) {
        router.refresh();
        window.location.reload();
      }
    } catch (e) {
      console.error("Error switching QA user:", e);
    } finally {
      setLoadingEmail(null);
    }
  };

  const usersList = [
    {
      email: "solicitante@maxiofertas.cl",
      label: "Solicitante Central",
      role: "WAREHOUSE_USER",
      desc: "Bodega Santiago Central",
      color: "bg-blue-100 text-blue-800 border-blue-200",
    },
    {
      email: "solicitante.norte@maxiofertas.cl",
      label: "Solicitante Norte",
      role: "WAREHOUSE_USER",
      desc: "Bodega Norte (Antofagasta)",
      color: "bg-cyan-100 text-cyan-800 border-cyan-200",
    },
    {
      email: "ejecutor@maxiofertas.cl",
      label: "Ejecutor de Facturas",
      role: "INVOICE_EXECUTOR",
      desc: "Mesa de Facturación & Cola",
      color: "bg-amber-100 text-amber-800 border-amber-200",
    },
    {
      email: "jefatura@maxiofertas.cl",
      label: "Jefatura Operaciones",
      role: "MANAGEMENT",
      desc: "Reportes & Estadísticas",
      color: "bg-purple-100 text-purple-800 border-purple-200",
    },
    {
      email: "admin@maxiofertas.cl",
      label: "Administrador",
      role: "ADMIN",
      desc: "Acceso Total",
      color: "bg-slate-200 text-slate-800 border-slate-300",
    },
  ];

  return (
    <aside aria-label="Selector de Rol QA" className="fixed bottom-4 right-4 z-50 font-sans">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2.5 shadow-lg border-2 border-amber-300 text-xs transition-all transform hover:scale-105"
        >
          <span className="text-base">🧪</span>
          <span>QA Role Switcher</span>
          {currentUser && (
            <span className="bg-amber-950/20 text-slate-950 px-2 py-0.5 rounded-full text-[11px] font-semibold">
              {currentUser.role}
            </span>
          )}
        </button>
      ) : (
        <div className="w-80 rounded-2xl bg-white shadow-2xl border-2 border-amber-400 p-4 text-slate-800 animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <div className="flex items-center gap-1.5 font-bold text-sm text-amber-900">
              <span>🧪</span>
              <span>Modo QA Local</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-0.5 rounded-md hover:bg-slate-100"
            >
              ✕
            </button>
          </div>

          <div className="mb-3 rounded-lg bg-slate-50 p-2.5 border border-slate-200 text-xs">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Sesión Activa:
            </p>
            {currentUser ? (
              <div>
                <p className="font-bold text-slate-900">{currentUser.name}</p>
                <p className="text-slate-600">{currentUser.email}</p>
                <span className="inline-block mt-1 rounded bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                  {currentUser.role}
                </span>
              </div>
            ) : (
              <p className="text-amber-700 italic">No hay sesión iniciada (Invitado)</p>
            )}
          </div>

          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Cambiar de Rol con 1 Clic:
          </p>

          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {usersList.map((u) => {
              const isCurrent = currentUser?.email === u.email;
              const isLoading = loadingEmail === u.email;
              return (
                <button
                  key={u.email}
                  onClick={() => handleSwitchUser(u.email)}
                  disabled={isCurrent || isLoading}
                  className={`w-full text-left p-2 rounded-xl border text-xs transition-all flex items-center justify-between ${
                    isCurrent
                      ? "bg-slate-100 border-slate-300 opacity-60 cursor-default"
                      : "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-sm"
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{u.label}</span>
                      {isCurrent && (
                        <span className="text-[10px] text-emerald-600 font-bold">✓ Activo</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">{u.desc}</p>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${u.color}`}
                  >
                    {isLoading ? "Cambiando..." : u.role}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center">
            Solo visible en entorno de desarrollo local.
          </div>
        </div>
      )}
    </aside>
  );
}
