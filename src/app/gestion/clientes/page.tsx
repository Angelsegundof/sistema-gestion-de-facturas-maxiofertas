"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SanitizedUser, SanitizedCustomer, Role } from "@/types";

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador del Sistema",
  MANAGEMENT: "Jefatura / Gerencia",
  INVOICE_EXECUTOR: "Ejecutor de Facturación",
  WAREHOUSE_USER: "Personal de Bodega",
};

export default function GestionClientesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [customers, setCustomers] = useState<SanitizedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit states
  const [selectedCustomer, setSelectedCustomer] = useState<SanitizedCustomer | null>(null);
  const [formLegalName, setFormLegalName] = useState("");
  const [formBusinessActivity, setFormBusinessActivity] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load / Search customers
  const loadCustomers = useCallback(async (query = "") => {
    try {
      const url = query ? `/api/v1/customers?q=${encodeURIComponent(query)}` : `/api/v1/customers`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.data?.customers) {
        setCustomers(data.data.customers);
      }
    } catch {
      setMessage({ type: "error", text: "Error al cargar el listado de clientes." });
    }
  }, []);

  // Load user session and verify permissions
  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const sessionRes = await fetch("/api/v1/auth/session");
        const sessionData = await sessionRes.json();

        if (
          !sessionData.success ||
          !sessionData.data?.user ||
          sessionData.data.user.role === "WAREHOUSE_USER"
        ) {
          router.push("/");
          return;
        }

        if (isMounted) {
          setCurrentUser(sessionData.data.user);
          await loadCustomers();
        }
      } catch {
        if (isMounted) router.push("/login");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    init();
    return () => {
      isMounted = false;
    };
  }, [router, loadCustomers]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search, loadCustomers]);

  // Open edit modal
  const handleOpenEdit = (customer: SanitizedCustomer) => {
    setSelectedCustomer(customer);
    setFormLegalName(customer.legalName);
    setFormBusinessActivity(customer.businessActivity);
    setFormPhone(customer.phone || "");
    setFormEmail(customer.email || "");
    setFormError(null);
    setShowConfirmModal(false);
  };

  // Close edit modal
  const handleCloseEdit = () => {
    setSelectedCustomer(null);
    setFormError(null);
    setShowConfirmModal(false);
  };

  // Calculate changes to confirm
  const calculatedChanges = useMemo(() => {
    if (!selectedCustomer) return [];
    const changes: { field: string; label: string; before: string; after: string }[] = [];

    const normLegalName = formLegalName.trim().replace(/\s+/g, " ");
    if (normLegalName && normLegalName !== selectedCustomer.legalName) {
      changes.push({
        field: "legalName",
        label: "Razón Social",
        before: selectedCustomer.legalName,
        after: normLegalName,
      });
    }

    const normBusiness = formBusinessActivity.trim().replace(/\s+/g, " ");
    if (normBusiness && normBusiness !== selectedCustomer.businessActivity) {
      changes.push({
        field: "businessActivity",
        label: "Giro Comercial",
        before: selectedCustomer.businessActivity,
        after: normBusiness,
      });
    }

    const normPhone = formPhone.trim().replace(/\s+/g, " ");
    if (normPhone !== (selectedCustomer.phone || "")) {
      changes.push({
        field: "phone",
        label: "Teléfono",
        before: selectedCustomer.phone || "(Sin teléfono)",
        after: normPhone || "(Eliminar teléfono)",
      });
    }

    const normEmail = formEmail.trim().toLowerCase();
    if (normEmail !== (selectedCustomer.email || "").toLowerCase()) {
      changes.push({
        field: "email",
        label: "Correo Electrónico",
        before: selectedCustomer.email || "(Sin correo)",
        after: normEmail || "(Eliminar correo)",
      });
    }

    return changes;
  }, [selectedCustomer, formLegalName, formBusinessActivity, formPhone, formEmail]);

  // Step 1: Pre-validation before opening confirmation
  const handlePrepareSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formLegalName.trim() || formLegalName.trim().length < 2) {
      setFormError("La razón social debe tener al menos 2 caracteres.");
      return;
    }
    if (!formBusinessActivity.trim() || formBusinessActivity.trim().length < 2) {
      setFormError("El giro comercial debe tener al menos 2 caracteres.");
      return;
    }

    if (formEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formEmail.trim())) {
        setFormError("El formato del correo electrónico es inválido.");
        return;
      }
    }

    if (calculatedChanges.length === 0) {
      setFormError("No se detectaron modificaciones en los datos del cliente.");
      return;
    }

    setShowConfirmModal(true);
  };

  // Step 2: Final submit to API
  const handleConfirmSave = async () => {
    if (!selectedCustomer) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const payload: Record<string, string | null> = {
        legalName: formLegalName.trim().replace(/\s+/g, " "),
        businessActivity: formBusinessActivity.trim().replace(/\s+/g, " "),
        phone: formPhone.trim() ? formPhone.trim().replace(/\s+/g, " ") : null,
        email: formEmail.trim() ? formEmail.trim().toLowerCase() : null,
      };

      const res = await fetch(`/api/v1/customers/${selectedCustomer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setFormError(data.error?.message || "No fue posible actualizar el cliente.");
        setShowConfirmModal(false);
        return;
      }

      setMessage({
        type: "success",
        text: `✓ Cliente ${selectedCustomer.rut} actualizado exitosamente: ${payload.legalName}`,
      });
      handleCloseEdit();
      await loadCustomers(search.trim());
    } catch {
      setFormError("Error de conexión al guardar los cambios.");
      setShowConfirmModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-3" />
          <p className="text-sm font-semibold">Cargando módulo de clientes...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header de navegación */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/gestion"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition flex items-center gap-1"
              >
                ← Volver a Gestión de Facturas
              </Link>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Administración y Corrección de Clientes
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Búsqueda y edición controlada de datos maestros de clientes registrados. El RUT es inmutable.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {currentUser ? ROLE_LABELS[currentUser.role] : "Autenticado"}
            </span>
            <button
              onClick={() => loadCustomers(search.trim())}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              ↻ Actualizar
            </button>
          </div>
        </header>

        {/* Notificación global */}
        {message && (
          <div
            className={`p-4 rounded-xl text-sm font-medium border flex items-center justify-between shadow-xs ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}
          >
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-xs font-bold hover:opacity-75 transition ml-4"
            >
              ✕ Cerrar
            </button>
          </div>
        )}

        {/* Barra de Búsqueda y Filtro */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Buscar por RUT (ej: 760560979 o 76.056.097-9), razón social, correo o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>
          <div className="text-xs font-medium text-slate-500 shrink-0">
            {customers.length} cliente{customers.length === 1 ? "" : "s"} encontrado{customers.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Tabla de Clientes */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">RUT</th>
                  <th className="py-3.5 px-4">Razón Social</th>
                  <th className="py-3.5 px-4">Giro Comercial</th>
                  <th className="py-3.5 px-4">Teléfono</th>
                  <th className="py-3.5 px-4">Correo Electrónico</th>
                  <th className="py-3.5 px-4">Última Actualización</th>
                  <th className="py-3.5 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="max-w-md mx-auto space-y-2">
                        <span className="text-3xl">👥</span>
                        <p className="font-semibold text-slate-700">No se encontraron clientes</p>
                        <p className="text-xs text-slate-400">
                          Intenta con otro término de búsqueda o verifica que el RUT o razón social esté correctamente escrito.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/75 transition">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {c.rut}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {c.legalName}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {c.businessActivity || "-"}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600 font-mono">
                        {c.phone || "-"}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {c.email || "-"}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500">
                        {formatDate(c.updatedAt)}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEdit(c)}
                          className="py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg transition inline-flex items-center gap-1 shadow-2xs"
                        >
                          <span>✏️</span>
                          <span>Editar</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal de Edición */}
        {selectedCustomer && !showConfirmModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Modificar Datos Maestros de Cliente
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Modifica los datos del cliente de forma controlada y auditada.
                  </p>
                </div>
                <button
                  onClick={handleCloseEdit}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              {/* RUT Prominente de Solo Lectura */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    RUT del Cliente
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    🔒 Solo Lectura / Inmutable
                  </span>
                </div>
                <div className="text-lg font-mono font-extrabold text-slate-900">
                  {selectedCustomer.rut}
                </div>
                <p className="text-[11px] text-slate-500">
                  El RUT es el identificador tributario del cliente y no se puede alterar desde la interfaz de usuario.
                </p>
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
                  {formError}
                </div>
              )}

              <form onSubmit={handlePrepareSave} className="space-y-3 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={formLegalName}
                    onChange={(e) => setFormLegalName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    placeholder="Ej: GRUPO PISTACHO SPA"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Evita abreviaciones informales o nombres de fantasía no oficiales.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Giro Comercial *
                  </label>
                  <input
                    type="text"
                    required
                    value={formBusinessActivity}
                    onChange={(e) => setFormBusinessActivity(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    placeholder="Ej: VENTA AL POR MENOR POR INTERNET"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Teléfono de Contacto
                    </label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      placeholder="+569 95000946"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      placeholder="contacto@cliente.cl"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseEdit}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-sm transition"
                  >
                    Revisar y Guardar →
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Confirmación Previa (Paso 7 & 13) */}
        {selectedCustomer && showConfirmModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
              <div className="border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Confirmación de Modificación
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  ¿Confirmas la actualización de los datos de este cliente?
                </h3>
              </div>

              {/* Ficha comparativa */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-bold">Cliente / RUT:</span>
                  <span className="font-mono font-extrabold text-sm text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    {selectedCustomer.rut}
                  </span>
                </div>

                <div className="space-y-2">
                  {calculatedChanges.map((change) => (
                    <div key={change.field} className="space-y-1 bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="font-bold text-slate-700">{change.label}:</div>
                      <div className="text-rose-600 line-through text-[11px]">
                        <span className="font-semibold text-slate-400">Anterior:</span> {change.before}
                      </div>
                      <div className="text-emerald-700 font-semibold text-xs">
                        <span className="font-semibold text-slate-500">Nuevo:</span> {change.after}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500 italic mt-2">
                  ℹ️ Esta modificación actualizará el maestro del cliente para futuras solicitudes y autocompletado, registrando una traza de auditoría con tus credenciales. Las facturas ya emitidas conservan sus snapshots originales.
                </p>
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
                  {formError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowConfirmModal(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition disabled:opacity-50"
                >
                  Modificar datos
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmSave}
                  className="py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>✓ Sí, Confirmar Actualización</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
