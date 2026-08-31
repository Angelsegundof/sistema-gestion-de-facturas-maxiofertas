"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCLP } from "@/domain/pricing";
import {
  SanitizedUser,
  SanitizedWarehouse,
  SanitizedInvoiceRequest,
  SanitizedRectification,
  QueueSummaryCounters,
  InvoiceRequestStatus,
  AgeCategory,
  RectificationReason,
} from "@/domain/types";

const REASON_LABELS: Record<RectificationReason, string> = {
  RUT: "RUT",
  LEGAL_NAME: "Razón Social",
  BUSINESS_ACTIVITY: "Giro",
  PRODUCT: "Producto",
  QUANTITY: "Cantidad",
  PRICE: "Precio",
  TOTAL: "Total",
  OTHER: "Otro",
};

export default function GestionFacturacionPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [warehouses, setWarehouses] = useState<SanitizedWarehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(true);

  // Queue state
  const [activeTab, setActiveTab] = useState<
    InvoiceRequestStatus | "RECTIFICATIONS" | "COMPLETED_TODAY"
  >("PENDING");
  const [requests, setRequests] = useState<SanitizedInvoiceRequest[]>([]);
  const [rectifications, setRectifications] = useState<SanitizedRectification[]>([]);
  const [counters, setCounters] = useState<QueueSummaryCounters>({
    pendingCount: 0,
    inProgressCount: 0,
    needsCorrectionCount: 0,
    changesRequestedCount: 0,
    completedTodayCount: 0,
  });
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");

  // Reset page to 1 when tab or filters change
  const handleTabChange = (tab: InvoiceRequestStatus | "RECTIFICATIONS" | "COMPLETED_TODAY") => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  // Load authenticated user and warehouses
  useEffect(() => {
    let isMounted = true;
    async function loadUserAndWarehouses() {
      try {
        const res = await fetch("/api/v1/auth/session");
        const data = await res.json();
        if (!isMounted) return;
        if (data.success && data.data?.user) {
          const u = data.data.user;
          if (u.role === "WAREHOUSE_USER") {
            router.push("/");
            return;
          }
          setCurrentUser(u);

          // Fetch warehouses for filter
          const whRes = await fetch("/api/v1/warehouses");
          const whData = await whRes.json();
          if (isMounted && whData.success && whData.data?.warehouses) {
            setWarehouses(whData.data.warehouses);
          }
        } else {
          router.push("/login");
        }
      } catch {
        if (isMounted) router.push("/login");
      } finally {
        if (isMounted) setLoadingUser(false);
      }
    }
    loadUserAndWarehouses();
    return () => {
      isMounted = false;
    };
  }, [router]);

  // Load queue items and counters
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;

    async function loadQueue() {
      try {
        setLoadingQueue(true);
        const searchParam = searchTerm.trim() ? `&search=${encodeURIComponent(searchTerm.trim())}` : "";
        const whParam = selectedWarehouseId ? `&warehouseId=${encodeURIComponent(selectedWarehouseId)}` : "";
        const pageParam = `&page=${currentPage}&pageSize=${pageSize}`;

        if (activeTab === "RECTIFICATIONS") {
          const res = await fetch(`/api/v1/rectifications?counters=true${searchParam}${whParam}${pageParam}`);
          const data = await res.json();
          if (!isMounted) return;
          if (data.success && data.data) {
            setRectifications(data.data.rectifications || []);
            setTotalCount(data.data.total || 0);
          }

          // Fetch counters in parallel with warehouse filter
          const countersRes = await fetch(`/api/v1/invoice-requests?status=PENDING&counters=true${whParam}`);
          const countersData = await countersRes.json();
          if (isMounted && countersData.success && countersData.data?.counters) {
            setCounters(countersData.data.counters);
          }
        } else if (activeTab === "COMPLETED_TODAY") {
          const res = await fetch(
            `/api/v1/invoice-requests?status=COMPLETED&todayOnly=true&counters=true${searchParam}${whParam}${pageParam}`
          );
          const data = await res.json();
          if (!isMounted) return;
          if (data.success && data.data) {
            setRequests(data.data.requests || []);
            setTotalCount(data.data.total || 0);
            if (data.data.counters) {
              setCounters(data.data.counters);
            }
          }
        } else {
          const res = await fetch(
            `/api/v1/invoice-requests?status=${activeTab}&counters=true${searchParam}${whParam}${pageParam}`
          );
          const data = await res.json();
          if (!isMounted) return;
          if (data.success && data.data) {
            setRequests(data.data.requests || []);
            setTotalCount(data.data.total || 0);
            if (data.data.counters) {
              setCounters(data.data.counters);
            }
          }
        }
      } catch {
        if (isMounted) setActionError("Error al cargar la cola de facturación.");
      } finally {
        if (isMounted) setLoadingQueue(false);
      }
    }

    loadQueue();
    return () => {
      isMounted = false;
    };
  }, [currentUser, activeTab, searchTerm, selectedWarehouseId, currentPage]);

  const refreshQueue = async () => {
    setLoadingQueue(true);
    try {
      const searchParam = searchTerm.trim() ? `&search=${encodeURIComponent(searchTerm.trim())}` : "";
      const whParam = selectedWarehouseId ? `&warehouseId=${encodeURIComponent(selectedWarehouseId)}` : "";
      if (activeTab === "RECTIFICATIONS") {
        const res = await fetch(`/api/v1/rectifications?page=1&pageSize=50${searchParam}${whParam}`);
        const data = await res.json();
        if (data.success && data.data) {
          setRectifications(data.data.rectifications || []);
        }
        const countersRes = await fetch(`/api/v1/invoice-requests?status=PENDING&counters=true${whParam}`);
        const countersData = await countersRes.json();
        if (countersData.success && countersData.data?.counters) {
          setCounters(countersData.data.counters);
        }
      } else {
        const res = await fetch(
          `/api/v1/invoice-requests?status=${activeTab}&counters=true${searchParam}${whParam}`
        );
        const data = await res.json();
        if (data.success && data.data) {
          setRequests(data.data.requests || []);
          if (data.data.counters) {
            setCounters(data.data.counters);
          }
        }
      }
    } catch {
      setActionError("Error al actualizar la cola.");
    } finally {
      setLoadingQueue(false);
    }
  };

  // Claim invoice request handler
  const handleClaimRequest = async (requestId: string) => {
    setClaimingId(requestId);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/claim`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success && data.data?.request) {
        router.push(`/gestion/${requestId}`);
      } else {
        setActionError(data.error?.message || "No fue posible tomar la solicitud.");
        await refreshQueue();
      }
    } catch {
      setActionError("Error de conexión al intentar tomar la solicitud.");
    } finally {
      setClaimingId(null);
    }
  };

  // Claim rectification handler
  const handleClaimRectification = async (rectificationId: string) => {
    setClaimingId(rectificationId);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/rectifications/${rectificationId}/claim`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success && data.data?.rectification) {
        router.push(`/gestion/rectificaciones/${rectificationId}`);
      } else {
        setActionError(data.error?.message || "No fue posible tomar la corrección.");
        await refreshQueue();
      }
    } catch {
      setActionError("Error de conexión al intentar tomar la corrección.");
    } finally {
      setClaimingId(null);
    }
  };

  // Take oldest request handler
  const handleTakeOldest = () => {
    if (requests.length > 0) {
      handleClaimRequest(requests[0].id);
    }
  };

  // Helper for Age pill styling
  const getAgeBadgeStyle = (category?: AgeCategory) => {
    switch (category) {
      case "over_2h":
        return "bg-rose-100 text-rose-800 border-rose-300";
      case "1_2h":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "30_60m":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "under_30m":
      default:
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
    }
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Cargando mesa de facturación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3.5">
            <img
              src="/icon.png"
              alt="Maxiofertas"
              className="w-12 h-12 object-contain rounded-xl border border-slate-100 p-0.5 bg-white shadow-xs shrink-0"
            />
            <div>
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Mesa Operativa de Facturación
              </span>
              <h1 className="text-2xl font-black text-slate-900">Cola de Emisión y Rectificación</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Sesión activa: <span className="font-semibold text-slate-700">{currentUser?.name}</span> ({currentUser?.role})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser?.role === "ADMIN" && (
              <Link
                href="/admin/usuarios"
                className="py-2 px-3.5 bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
              >
                <span>👥</span>
                <span>Gestionar Usuarios</span>
              </Link>
            )}

            {(currentUser?.role === "MANAGEMENT" || currentUser?.role === "ADMIN") && (
              <Link
                href="/estadisticas"
                className="py-2 px-3.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
              >
                <span>📊</span>
                <span>Ver Estadísticas</span>
              </Link>
            )}

            <button
              onClick={refreshQueue}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              ↻ Actualizar
            </button>

            {activeTab === "PENDING" && requests.length > 0 && (
              <button
                onClick={handleTakeOldest}
                disabled={!!claimingId}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md transition disabled:opacity-50"
              >
                {claimingId ? "Tomando..." : "⚡ Tomar la más antigua"}
              </button>
            )}
          </div>
        </header>

        {/* Operational Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div
            onClick={() => handleTabChange("PENDING")}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeTab === "PENDING"
                ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400"
                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            }`}
          >
            <p className="text-xs font-bold text-slate-500 uppercase">Pendientes</p>
            <p className="text-2xl font-extrabold text-amber-700 mt-1">{counters.pendingCount}</p>
          </div>

          <div
            onClick={() => handleTabChange("IN_PROGRESS")}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeTab === "IN_PROGRESS"
                ? "bg-blue-50 border-blue-400 ring-2 ring-blue-400"
                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            }`}
          >
            <p className="text-xs font-bold text-slate-500 uppercase">En proceso</p>
            <p className="text-2xl font-extrabold text-blue-700 mt-1">{counters.inProgressCount}</p>
          </div>

          <div
            onClick={() => handleTabChange("NEEDS_CORRECTION")}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeTab === "NEEDS_CORRECTION"
                ? "bg-rose-50 border-rose-400 ring-2 ring-rose-400"
                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            }`}
          >
            <p className="text-xs font-bold text-slate-500 uppercase">Corrección Previa</p>
            <p className="text-2xl font-extrabold text-rose-700 mt-1">{counters.needsCorrectionCount}</p>
          </div>

          <div
            onClick={() => handleTabChange("RECTIFICATIONS")}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeTab === "RECTIFICATIONS"
                ? "bg-purple-50 border-purple-400 ring-2 ring-purple-400"
                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            }`}
          >
            <p className="text-xs font-bold text-purple-700 uppercase">Cambios solicitados</p>
            <p className="text-2xl font-extrabold text-purple-800 mt-1">{counters.changesRequestedCount}</p>
          </div>

          <div
            onClick={() => handleTabChange("COMPLETED_TODAY")}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeTab === "COMPLETED_TODAY"
                ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400"
                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            }`}
          >
            <p className="text-xs font-bold text-slate-500 uppercase">Listas hoy</p>
            <p className="text-2xl font-extrabold text-emerald-700 mt-1">{counters.completedTodayCount}</p>
          </div>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-sm text-rose-800 flex justify-between items-center">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="text-xs font-bold text-rose-600 hover:underline"
            >
              ✕ Cerrar
            </button>
          </div>
        )}

        {/* Search and Filter bar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleTabChange("PENDING")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "PENDING" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Pendientes ({counters.pendingCount})
            </button>
            <button
              onClick={() => handleTabChange("IN_PROGRESS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "IN_PROGRESS" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              En proceso ({counters.inProgressCount})
            </button>
            <button
              onClick={() => handleTabChange("NEEDS_CORRECTION")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "NEEDS_CORRECTION"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Correcciones ({counters.needsCorrectionCount})
            </button>
            <button
              onClick={() => handleTabChange("RECTIFICATIONS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "RECTIFICATIONS"
                  ? "bg-purple-700 text-white"
                  : "bg-purple-50 text-purple-800 hover:bg-purple-100"
              }`}
            >
              Cambios solicitados ({counters.changesRequestedCount})
            </button>
            <button
              onClick={() => handleTabChange("COMPLETED_TODAY")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "COMPLETED_TODAY" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Listas hoy ({counters.completedTodayCount})
            </button>
            <button
              onClick={() => handleTabChange("COMPLETED")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "COMPLETED" ? "bg-emerald-700 text-white shadow-xs" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              📜 Realizadas (Histórico)
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            {/* Bodega Selector */}
            <select
              value={selectedWarehouseId}
              onChange={(e) => {
                setSelectedWarehouseId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto px-3 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">Bodega: Todas</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <div className="w-full sm:w-64">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar por número, RUT, cliente o ejecutor..."
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* RECTIFICATIONS TABLE VIEW */}
        {activeTab === "RECTIFICATIONS" ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {loadingQueue ? (
              <div className="p-8 text-center text-sm text-slate-500">Cargando solicitudes de cambio...</div>
            ) : rectifications.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <p className="text-base font-semibold">No hay facturas con cambios solicitados pendientes.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Cuando una bodega solicite corregir una factura emitida, aparecerá aquí.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-purple-50 text-purple-900 border-b border-purple-100 uppercase font-semibold">
                    <tr>
                      <th className="p-3.5">N° Solicitud</th>
                      <th className="p-3.5">Motivo del Cambio</th>
                      <th className="p-3.5">Comentario del Solicitante</th>
                      <th className="p-3.5">Estado</th>
                      <th className="p-3.5">Antigüedad</th>
                      <th className="p-3.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rectifications.map((r) => {
                      const isAssigned = !!r.assignedTo;
                      const isAssignedToMe = r.assignedTo === currentUser?.id || currentUser?.role === "ADMIN";

                      return (
                        <tr key={r.id} className="hover:bg-purple-50/30 transition">
                          <td className="p-3.5 font-bold text-slate-900">
                            {r.requestNumber || "FAC-XXXX"}
                          </td>
                          <td className="p-3.5">
                            <span className="font-extrabold text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md">
                              {REASON_LABELS[r.reason] || r.reason}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-600 max-w-xs truncate" title={r.comment || ""}>
                            {r.comment || "Sin comentarios"}
                          </td>
                          <td className="p-3.5">
                            <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-800 rounded-lg">
                              {r.status}
                            </span>
                          </td>
                          <td className="p-3.5">
                            {r.age && (
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getAgeBadgeStyle(
                                  r.age.category
                                )}`}
                              >
                                {r.age.displayAge}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            {isAssigned ? (
                              <Link
                                href={`/gestion/rectificaciones/${r.id}`}
                                className="inline-block py-1.5 px-3 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg transition text-xs"
                              >
                                {isAssignedToMe ? "Continuar corrección →" : "Ver detalle"}
                              </Link>
                            ) : (
                              <button
                                onClick={() => handleClaimRectification(r.id)}
                                disabled={claimingId === r.id}
                                className="py-1.5 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition disabled:opacity-50 text-xs"
                              >
                                {claimingId === r.id ? "Tomando..." : "Tomar corrección"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* STANDARD REQUESTS / REALIZADAS TABLE */
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {loadingQueue ? (
              <div className="p-8 text-center text-sm text-slate-500">Cargando solicitudes...</div>
            ) : requests.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <p className="text-base font-semibold">
                  {activeTab === "COMPLETED"
                    ? "No se encontraron facturas realizadas con los filtros aplicados."
                    : activeTab === "COMPLETED_TODAY"
                    ? "Aún no se han emitido facturas durante el día de hoy."
                    : "No hay solicitudes en esta sección."}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {activeTab === "COMPLETED"
                    ? "Las facturas completadas se conservan aquí de manera permanente."
                    : "Las nuevas solicitudes aparecerán automáticamente."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold">
                    <tr>
                      <th className="p-3.5">N° Solicitud</th>
                      <th className="p-3.5">Bodega</th>
                      <th className="p-3.5">Cliente</th>
                      <th className="p-3.5">Monto Total</th>
                      {activeTab === "COMPLETED" || activeTab === "COMPLETED_TODAY" ? (
                        <>
                          <th className="p-3.5">Fecha Realización</th>
                          <th className="p-3.5">Ejecutor</th>
                        </>
                      ) : (
                        <th className="p-3.5">Antigüedad</th>
                      )}
                      <th className="p-3.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((r) => {
                      const isAssigned = !!r.assignedTo;
                      const isAssignedToMe = r.assignedTo === currentUser?.id || currentUser?.role === "ADMIN";
                      const isCompletedView = activeTab === "COMPLETED" || activeTab === "COMPLETED_TODAY";

                      const formattedCompletedAt = r.completedAt
                        ? new Date(r.completedAt).toLocaleString("es-CL", {
                            timeZone: "America/Santiago",
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—";

                      return (
                        <tr key={r.id} className="hover:bg-slate-50 transition">
                          <td className="p-3.5 font-bold text-slate-900">
                            {r.requestNumber}
                            {r.duplicateWarning && (
                              <span className="ml-1.5 text-[10px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                ⚠ Duplicado
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-medium text-slate-700">{r.warehouse?.name || "—"}</td>
                          <td className="p-3.5">
                            <p className="font-semibold text-slate-900">{r.customerLegalNameSnapshot}</p>
                            <p className="text-[11px] text-slate-500">{r.customerRutSnapshot}</p>
                          </td>
                          <td className="p-3.5 font-extrabold text-slate-900">
                            {formatCLP(r.expectedGrossTotal)}
                          </td>

                          {isCompletedView ? (
                            <>
                              <td className="p-3.5 text-slate-700 font-medium">
                                {formattedCompletedAt}
                              </td>
                              <td className="p-3.5">
                                <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                                  👤 {r.assignedName || "Ejecutor"}
                                </span>
                              </td>
                            </>
                          ) : (
                            <td className="p-3.5">
                              {r.age && (
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getAgeBadgeStyle(
                                    r.age.category
                                  )}`}
                                >
                                  {r.age.displayAge}
                                </span>
                              )}
                            </td>
                          )}

                          <td className="p-3.5 text-right">
                            {activeTab === "PENDING" ? (
                              <button
                                onClick={() => handleClaimRequest(r.id)}
                                disabled={claimingId === r.id}
                                className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:opacity-50"
                              >
                                {claimingId === r.id ? "Tomando..." : "Tomar solicitud"}
                              </button>
                            ) : (
                              <Link
                                href={`/gestion/${r.id}`}
                                className={`inline-block py-1.5 px-3 font-bold rounded-lg transition ${
                                  isCompletedView
                                    ? "bg-slate-800 hover:bg-slate-900 text-white shadow-xs"
                                    : isAssignedToMe
                                    ? "bg-slate-900 hover:bg-slate-800 text-white"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                }`}
                              >
                                {isCompletedView
                                  ? "Ver detalle"
                                  : isAssignedToMe
                                  ? "Trabajar →"
                                  : "Ver detalle"}
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalCount > pageSize && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Mostrando{" "}
                  <span className="font-bold text-slate-700">
                    {(currentPage - 1) * pageSize + 1}
                  </span>{" "}
                  a{" "}
                  <span className="font-bold text-slate-700">
                    {Math.min(currentPage * pageSize, totalCount)}
                  </span>{" "}
                  de <span className="font-bold text-slate-700">{totalCount}</span> registros
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs font-bold text-slate-600 px-2">
                    Página {currentPage} de {Math.ceil(totalCount / pageSize)}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) =>
                        p < Math.ceil(totalCount / pageSize) ? p + 1 : p
                      )
                    }
                    disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
