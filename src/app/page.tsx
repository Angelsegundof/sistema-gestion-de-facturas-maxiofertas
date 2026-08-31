import Link from "next/link";
import { getServerSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import RequesterInvoiceList from "@/components/RequesterInvoiceList";
import { Role } from "@/domain/types";

const ROLE_LABELS: Record<Role, string> = {
  WAREHOUSE_USER: "Solicitante / Bodega",
  INVOICE_EXECUTOR: "Ejecutor de Facturación",
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
          <img
            src="/icon.png"
            alt="Maxiofertas"
            className="inline-block w-16 h-16 mb-4 object-contain rounded-2xl shadow-sm border border-slate-100 p-1 bg-white"
          />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Sistema de Gestión de Facturas Maxiofertas
          </h1>
          <p className="text-sm text-slate-600 mb-6">
            Plataforma interna independiente de gestión tributaria y emisión de facturas.
          </p>
          <div className="p-4 bg-slate-50 rounded-xl text-left text-xs text-slate-600 border border-slate-200 mb-6">
            <p className="font-semibold text-slate-800 mb-1">Estado de Seguridad y Acceso:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Autenticación propia mediante sesiones server-side e HttpOnly cookies.</li>
              <li>Autorización basada en roles con política Default Deny.</li>
              <li>Auditoría transaccional de accesos e identidades.</li>
            </ul>
          </div>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Iniciar Sesión
          </Link>
        </div>
      </main>
    );
  }

  const { user } = sessionResult;

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <img
              src="/icon.png"
              alt="Maxiofertas"
              className="inline-block w-12 h-12 object-contain rounded-xl shadow-sm border border-slate-100 p-0.5 bg-white shrink-0"
            />
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Sistema de Gestión de Facturas
              </h1>
              <p className="text-xs text-slate-500">
                Maxiofertas • Sesión Autenticada
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

        {/* Acciones principales según Rol */}
        {(user.role === "INVOICE_EXECUTOR" || user.role === "ADMIN" || user.role === "MANAGEMENT") && (
          <section className="p-6 bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
                Módulo Operacional
              </span>
              <h2 className="text-xl font-bold mt-1">Mesa de Facturación y Emisión</h2>
              <p className="text-xs text-slate-300 mt-1 max-w-md">
                Consulta las facturas pendientes ordenadas por antigüedad (FIFO), toma solicitudes y gestiona rectificaciones.
              </p>
            </div>
            <Link
              href="/gestion"
              className="inline-flex items-center justify-center py-3 px-6 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm rounded-xl shadow-md transition shrink-0"
            >
              Ir a Gestión de Facturas →
            </Link>
          </section>
        )}

        {/* Módulo Estadísticas para Management y Admin */}
        {(user.role === "MANAGEMENT" || user.role === "ADMIN") && (
          <section className="p-6 bg-gradient-to-r from-purple-900 to-slate-900 text-white rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                Módulo Gerencial
              </span>
              <h2 className="text-xl font-bold mt-1">Estadísticas y Facturación Vigente</h2>
              <p className="text-xs text-slate-300 mt-1 max-w-md">
                Facturado vigente, base imponible neta, IVA débito estimado, ticket promedio y distribución por bodega.
              </p>
            </div>
            <Link
              href="/estadisticas"
              className="inline-flex items-center justify-center py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold text-sm rounded-xl shadow-md transition shrink-0"
            >
              📊 Ver Estadísticas →
            </Link>
          </section>
        )}

        {/* Módulo Solicitante (Crear Solicitud + Listado de Facturas) */}
        {(user.role === "WAREHOUSE_USER" || user.role === "ADMIN") && (
          <div className="space-y-6">
            <section className="p-6 bg-gradient-to-r from-slate-900 to-emerald-950 text-white rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Módulo Solicitante
                </span>
                <h2 className="text-xl font-bold mt-1">Crear Solicitud de Factura</h2>
                <p className="text-xs text-slate-300 mt-1 max-w-md">
                  Ingresa los datos del cliente y productos con precios IVA incluido para enviar a facturación.
                </p>
              </div>
              <Link
                href="/solicitar"
                className="inline-flex items-center justify-center py-3 px-6 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl shadow-md transition shrink-0"
              >
                + Solicitar factura
              </Link>
            </section>

            {/* Listado de Facturas del Solicitante (QA-006) */}
            <RequesterInvoiceList />
          </div>
        )}

        {/* Módulo Administrador: Gestión de Usuarios */}
        {user.role === "ADMIN" && (
          <section className="p-6 bg-gradient-to-r from-rose-900 to-slate-900 text-white rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-300">
                Módulo Administrador
              </span>
              <h2 className="text-xl font-bold mt-1">Gestión de Usuarios, Roles y Claves</h2>
              <p className="text-xs text-slate-300 mt-1 max-w-md">
                Crea nuevos usuarios, modifica roles de acceso, reinicia contraseñas y asigna bodegas físicas a los colaboradores.
              </p>
            </div>
            <Link
              href="/admin/usuarios"
              className="inline-flex items-center justify-center py-3 px-6 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-md transition shrink-0"
            >
              👥 Gestionar Usuarios →
            </Link>
          </section>
        )}

        {/* Perfil del Usuario */}
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
              <span className="text-xs text-slate-500 block">Correo Electrónico</span>
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
      </div>
    </main>
  );
}
