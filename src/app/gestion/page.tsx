"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCLP } from "@/domain/pricing";
import {
  SanitizedUser,
  SanitizedInvoiceRequest,
  QueueSummaryCounters,
  InvoiceRequestStatus,
  AgeCategory,
} from "@/domain/types";

export default function GestionFacturacionPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Queue state
  const [activeTab, setActiveTab] = useState<InvoiceRequestStatus>("PENDING");
  const [requests, setRequests] = useState<SanitizedInvoiceRequest[]>([]);
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

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");

  // Load authenticated user
  useEffect(() => {
    let isMounted = true;
    async function loadUser() {
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
        } else {
          router.push("/login");
        }
      } catch {
        if (isMounted) router.push("/login");
      } finally {
        if (isMounted) setLoadingUser(false);
      }
    }
    loadUser();
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
        const searchParam = searchTerm.trim() ? `&search=${encodeURIComponent(searchTerm.trim())}` : "";
        const res = await fetch(
          `/api/v1/invoice-requests?status=${activeTab}&counters=true${searchParam}`
        );
        const data = await res.json();
        if (!isMounted) return;
        if (data.success && data.data) {
          setRequests(data.data.requests || []);
          if (data.data.counters) {
            setCounters(data.data.counters);
          }
        }
      } catch {
        if (isMounted) setActionError("Error al cargar la cola de facturaci?n.");
      } finally {
        if (isMounted) setLoadingQueue(false);
      }
    }

    loadQueue();
    return () => {
      isMounted = false;
    };
  }, [currentUser, activeTab, searchTerm]);

  const refreshQueue = async () => {
    setLoadingQueue(true);
    setActionError(null);
    try {
      const searchParam = searchTerm.trim() ? `&search=${encodeURIComponent(searchTerm.trim())}` : "";
      const res = await fetch(
        `/api/v1/invoice-requests?status=${activeTab}&counters=true${searchParam}`
      );
      const data = await res.json();
      if (data.success && data.data) {
        setRequests(data.data.requests || []);
        if (data.data.counters) {
          setCounters(data.data.counters);
        }
      }
    } catch {
      setActionError("Error al refrescar la cola de facturaci?n.");
    } finally {
      setLoadingQueue(false);
    }
  };

  // Claim handler (Tomar solicitud)
  const handleClaim = async (requestId: string) => {
    setClaimingId(requestId);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (res.ok && data.success) {
        router.push(`/gestion/${requestId}`);
      } else {
        setActionError(data.error?.message || "Esta solicitud ya est? siendo gestionada por otro usuario.");
        refreshQueue();
      }
    } catch {
      setActionError("Error de comunicaci?n al tomar la solicitud.");
    } finally {
      setClaimingId(null);
    }
  };

  const renderAgeChip = (category?: AgeCategory, displayAge?: string) => {
    if (!displayAge) return null;
    let bg = "bg-slate-100 text-slate-700 border-slate-200";
    if (category === "under_30m") bg = "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold";
    if (category === "30_60m") bg = "bg-yellow-50 text-yellow-800 border-yellow-200 font-semibold";
    if (category === "1_2h") bg = "bg-orange-50 text-orange-800 border-orange-200 font-semibold";
    if (category === "over_2h") bg = "bg-rose-50 text-rose-800 border-rose-200 font-bold";

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${bg}`}>
        {displayAge}
      </span>
    );
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-600">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Mobile notice */}
        <div className="md:hidden bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-center gap-2">
          <span>?</span>
          <span>La gesti?n de facturas est? optimizada para computador.</span>
        </div>

        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/" className="text-xs text-blue-600 hover:underline">
                ? Inicio
              </Link>
              <span className="text-xs text-slate-400">?</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                M?dulo de Facturaci?n
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Gesti?n de Facturas</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Cola operacional ordenada por antig?edad (m?s antigua primero).
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-200">
              {currentUser?.role === "ADMIN" ? "Administrador" : "Ejecutor de Facturaci?n"}
            </span>
            <p className="text-xs text-slate-500 mt-1">{currentUser?.name}</p>
          </div>
        </header>

        {/* Operational Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            onClick={() => setActiveTab("PENDING")}
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
            onClick={() => setActiveTab("IN_PROGRESS")}
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
            onClick={() => setActiveTab("NEEDS_CORRECTION")}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeTab === "NEEDS_CORRECTION"
                ? "bg-rose-50 border-rose-400 ring-2 ring-rose-400"
                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            }`}
          >
            <p className="text-xs font-bold text-slate-500 uppercase">Necesitan correcci?n</p>
            <p className="text-2xl font-extrabold text-rose-700 mt-1">{counters.needsCorrectionCount}</p>
          </div>

          <div
            onClick={() => setActiveTab("COMPLETED")}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeTab === "COMPLETED"
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
              ? Cerrar
            </button>
          </div>
        )}

        {/* Search and Filter bar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("PENDING")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "PENDING" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Pendientes ({counters.pendingCount})
            </button>
            <button
              onClick={() => setActiveTab("IN_PROGRESS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "IN_PROGRESS" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              En proceso ({counters.inProgressCount})
            </button>
            <button
              onClick={() => setActiveTab("NEEDS_CORRECTION")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "NEEDS_CORRECTION"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Necesitan correcci?n ({counters.needsCorrectionCount})
            </button>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por n?mero, RUT o cliente..."
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Work Queue Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loadingQueue ? (
            <div className="p-8 text-center text-sm text-slate-500">Cargando cola de solicitudes...</div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <p className="text-base font-semibold">No hay solicitudes en esta secci?n.</p>
              <p className="text-xs text-slate-400 mt-1">Las nuevas solicitudes aparecer?n autom?ticamente.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Esperando</th>
                    <th className="py-3 px-4">N?mero</th>
                    <th className="py-3 px-4">Bodega</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">RUT</th>
                    <th className="py-3 px-4 text-right">Total a facturar</th>
                    <th className="py-3 px-4">Solicitante</th>
                    <th className="py-3 px-4 text-center">Acci?n</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {requests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderAgeChip(r.age?.category, r.age?.displayAge)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.requestNumber}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">
                          {r.warehouse?.name ? r.warehouse.name.replace("Bodega ", "") : "Central"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{r.customerLegalNameSnapshot}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{r.customerRutSnapshot}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {formatCLP(r.expectedGrossTotal)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{r.requesterName || "Solicitante"}</td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {activeTab === "PENDING" && (
                          <button
                            onClick={() => handleClaim(r.id)}
                            disabled={claimingId === r.id}
                            className="py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition disabled:opacity-50"
                          >
                            {claimingId === r.id ? "Tomando..." : "Tomar"}
                          </button>
                        )}
                        {activeTab === "IN_PROGRESS" && (
                          <Link
                            href={`/gestion/${r.id}`}
                            className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition"
                          >
                            Abrir mesa
                          </Link>
                        )}
                        {activeTab === "NEEDS_CORRECTION" && (
                          <Link
                            href={`/requests/${r.id}`}
                            className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-300 transition"
                          >
                            Ver detalle
                          </Link>
                        )}
                        {activeTab === "COMPLETED" && (
                          <Link
                            href={`/requests/${r.id}`}
                            className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-300 transition"
                          >
                            Ver factura
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
