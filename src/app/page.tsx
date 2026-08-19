import Link from "next/link";
import { getServerSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { Role } from "@/domain/types";

const ROLE_LABELS: Record<Role, string> = {
  WAREHOUSE_USER: "Solicitante / Bodega",
  INVOICE_EXECUTOR: "Ejecutor de Facturaci?n",
  MANAGEMENT: "Jefatura / Gerencia",
  ADMIN: "Administrador del Sistema",
};

const ROLE_COLORS: Record<Role, string> = {
  WAREHOUSE_USER: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INVOICE_EXECUTOR: "bg-blue-50 text-blue-700 border-blue-200",
  MANAGEMENT: "bg-purple-50 text-purple-700 border-purple-200",
  ADMIN: "bg-amber-50 text-amber-700 border-amber-200",
};

export default async function HomePage() {
  const sessionResult = await getServerSession();

  if (!sessionResult) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-lg p-8 bg-white rounded-2xl shadow-sm border border-slate-200 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-blue-600 text-white font-bold text-2xl shadow-sm">
            M
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Sistema de Gesti?n de Facturas Maxiofertas
          </h1>
          <p className="text-sm text-slate-600 mb-6">
            Plataforma interna independiente de gesti?n tributaria y emisi?n de facturas.
          </p>
          <div className="p-4 bg-slate-50 rounded-xl text-left text-xs text-slate-600 border border-slate-200 mb-6">
            <p className="font-semibold text-slate-800 mb-1">Estado de Seguridad y Acceso:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Autenticaci?n propia mediante sesiones server-side e HttpOnly cookies.</li>
              <li>Autorizaci?n basada en roles con pol?tica Default Deny.</li>
              <li>Auditor?a transaccional de accesos e identidades.</li>
            </ul>
          </div>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Iniciar Sesi?n
          </Link>
        </div>
      </main>
    );
  }

  const { user } = sessionResult;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white font-bold text-xl shadow-sm">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Sistema de Gesti?n de Facturas
              </h1>
              <p className="text-xs text-slate-500">
                Maxiofertas ? Sesi?n Autenticada
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${ROLE_COLORS[user.role]}`}
            >
              {ROLE_LABELS[user.role]}
            </span>
            <LogoutButton />
          </div>
        </header>

        <section className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800">
            Perfil de Usuario Autenticado
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500 block">Nombre</span>
              <span className="font-medium text-slate-800">{user.name}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500 block">Correo Electr?nico</span>
              <span className="font-medium text-slate-800">{user.email}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500 block">Rol del Sistema</span>
              <span className="font-medium text-slate-800">{user.role} ({ROLE_LABELS[user.role]})</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500 block">Estado de Cuenta</span>
              <span className="font-semibold text-emerald-600">
                {user.active ? "Activo" : "Inactivo"}
              </span>
            </div>
          </div>
        </section>

        <section className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 mb-2">
            M?dulos Operacionales (Fase 2)
          </h2>
          <p className="text-xs text-slate-600 mb-4">
            Autenticaci?n y autorizaci?n completadas. Los m?dulos de gesti?n de solicitudes, facturas y bodegas se activar?n en las fases 3 a 13.
          </p>
          <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 text-xs text-blue-900 font-mono">
            Control de Acceso: Matriz de Roles v1.0 activa ? Default Deny en vigor.
          </div>
        </section>
      </div>
    </main>
  );
}
