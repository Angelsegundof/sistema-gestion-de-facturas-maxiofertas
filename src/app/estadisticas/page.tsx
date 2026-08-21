"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCLP } from "@/domain/pricing";
import {
  SanitizedUser,
  SanitizedWarehouse,
  StatisticsSummary,
  WarehouseStatistics,
  MonthlyEvolutionItem,
} from "@/domain/types";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export default function EstadisticasPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [warehouses, setWarehouses] = useState<SanitizedWarehouse[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);

  // Filter state (Personal / Local)
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");

  // Data state
  const [summary, setSummary] = useState<StatisticsSummary | null>(null);
  const [warehouseStats, setWarehouseStats] = useState<WarehouseStatistics[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyEvolutionItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load Session & Warehouses
  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const sessionRes = await fetch("/api/v1/auth/session");
        const sessionData = await sessionRes.json();
        if (!isMounted) return;

        if (!sessionData.success || !sessionData.data?.user) {
          router.push("/login");
          return;
        }

        const user: SanitizedUser = sessionData.data.user;
        if (user.role === "WAREHOUSE_USER") {
          // Warehouse users don't have access to general stats
          router.push("/");
          return;
        }
        setCurrentUser(user);

        // Fetch warehouses for filter
        const whRes = await fetch("/api/v1/warehouses");
        const whData = await whRes.json();
        if (isMounted && whData.success && whData.data?.warehouses) {
          setWarehouses(whData.data.warehouses);
        }
      } catch {
        if (isMounted) router.push("/login");
      } finally {
        if (isMounted) setLoadingUser(false);
      }
    }

    init();
    return () => {
      isMounted = false;
    };
  }, [router]);

  // Load Statistics Data on filter changes
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;

    async function loadStats() {
      setLoadingData(true);
      setErrorMsg(null);

      const whParam = selectedWarehouseId ? `&warehouseId=${encodeURIComponent(selectedWarehouseId)}` : "";
      const queryParams = `?month=${selectedMonth}&year=${selectedYear}${whParam}`;

      try {
        const [sumRes, whRes, monRes] = await Promise.all([
          fetch(`/api/v1/statistics/summary${queryParams}`),
          fetch(`/api/v1/statistics/by-warehouse${queryParams}`),
          fetch(`/api/v1/statistics/monthly?months=6${whParam}`),
        ]);

        const [sumJson, whJson, monJson] = await Promise.all([
          sumRes.json(),
          whRes.json(),
          monRes.json(),
        ]);

        if (!isMounted) return;

        if (sumJson.success && sumJson.data?.summary) {
          setSummary(sumJson.data.summary);
        } else {
          setErrorMsg(sumJson.error?.message || "No se pudieron cargar las estadísticas.");
        }

        if (whJson.success && whJson.data?.warehouses) {
          setWarehouseStats(whJson.data.warehouses);
        }

        if (monJson.success && monJson.data?.history) {
          setMonthlyHistory(monJson.data.history);
        }
      } catch {
        if (isMounted) setErrorMsg("Error de red al consultar estadísticas.");
      } finally {
        if (isMounted) setLoadingData(false);
      }
    }

    loadStats();
    return () => {
      isMounted = false;
    };
  }, [currentUser, selectedMonth, selectedYear, selectedWarehouseId]);

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Cargando estadísticas...</p>
        </div>
      </div>
    );
  }

  // Max value in monthly history for chart scaling
  const maxMonthlyVal = Math.max(
    ...monthlyHistory.map((m) => Math.max(m.grossTotal, m.creditNotesTotal)),
    1
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <header className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 transition"
                >
                  ← Inicio
                </Link>
                <span className="text-slate-300">/</span>
                <Link
                  href="/gestion"
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 transition"
                >
                  Cola de Facturación
                </Link>
                <span className="text-slate-300">/</span>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  Panel Gerencial
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 mt-1">Estadísticas y Facturación Vigente</h1>
              <p className="text-xs text-slate-500">
                Métricas financieras y operacionales calculadas exclusivamente sobre facturas válidas no anuladas.
              </p>
            </div>

            {/* Filter Selectors Bar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Month Selector */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Year Selector */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              {/* Warehouse Selector (Admin/Management only) */}
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">Todas las bodegas</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 text-xs font-bold text-rose-800">
            {errorMsg}
          </div>
        )}

        {/* FINANCIAL KPIS GRID */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Facturado Vigente (Hero Card) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-200 ring-2 ring-emerald-400/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
                  Total Facturado Vigente
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                  {summary.period.label}
                </span>
              </div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">
                {formatCLP(summary.grossTotal)}
              </p>
              <p className="text-xs text-slate-500">
                IVA incluido (excluye facturas anuladas por NC)
              </p>
            </div>

            {/* 2. Neto Estimado */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Neto Estimado
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-50 text-blue-800 rounded-full">
                  Base Imponible
                </span>
              </div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">
                {formatCLP(summary.netEstimated)}
              </p>
              <p className="text-xs text-slate-500">
                Cálculo exacto (round gross × 100 / 119)
              </p>
            </div>

            {/* 3. IVA Débito Estimado */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                  IVA Débito Estimado
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-purple-50 text-purple-800 rounded-full">
                  19% Estándar
                </span>
              </div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">
                {formatCLP(summary.vatEstimated)}
              </p>
              <p className="text-xs text-slate-500">
                Bruto vigente - Neto estimado
              </p>
            </div>

            {/* 4. Cantidad de Facturas Vigentes */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Facturas Vigentes
              </span>
              <p className="text-3xl font-black text-slate-900 tracking-tight">
                {summary.invoiceCount}
              </p>
              <p className="text-xs text-slate-500">
                Documentos válidos emitidos en el período
              </p>
            </div>

            {/* 5. Ticket Promedio */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Ticket Promedio
              </span>
              <p className="text-3xl font-black text-slate-900 tracking-tight">
                {formatCLP(summary.averageTicket)}
              </p>
              <p className="text-xs text-slate-500">
                Facturación vigente / Facturas vigentes
              </p>
            </div>

            {/* 6. Notas de Crédito & Bruto Emitido */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                  Notas de Crédito (Anulaciones)
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-rose-50 text-rose-800 rounded-full">
                  {summary.creditNotesCount} NC
                </span>
              </div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">
                {formatCLP(summary.creditNotesTotal)}
              </p>
              <p className="text-xs text-slate-500">
                Bruto total emitido: {formatCLP(summary.grossIssued)}
              </p>
            </div>
          </div>
        )}

        {/* OPERATIONAL PROGRESS SECTION */}
        {summary && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Métricas Operativas del Período
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <p className="text-xs font-semibold text-slate-500">Solicitudes</p>
                <p className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {summary.operational.totalRequests}
                </p>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
                <p className="text-xs font-semibold text-amber-700">Pendientes</p>
                <p className="text-xl font-extrabold text-amber-900 mt-0.5">
                  {summary.operational.pending}
                </p>
              </div>

              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-center">
                <p className="text-xs font-semibold text-blue-700">En proceso</p>
                <p className="text-xl font-extrabold text-blue-900 mt-0.5">
                  {summary.operational.inProgress}
                </p>
              </div>

              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-center">
                <p className="text-xs font-semibold text-rose-700">Corrección Previa</p>
                <p className="text-xl font-extrabold text-rose-900 mt-0.5">
                  {summary.operational.needsCorrection}
                </p>
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-center">
                <p className="text-xs font-semibold text-purple-700">Rectificaciones</p>
                <p className="text-xl font-extrabold text-purple-900 mt-0.5">
                  {summary.operational.changesRequested}
                </p>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <p className="text-xs font-semibold text-emerald-700">Resolución Prom.</p>
                <p className="text-xl font-extrabold text-emerald-900 mt-0.5">
                  {summary.operational.averageResolutionMinutes} min
                </p>
              </div>
            </div>
          </div>
        )}

        {/* FACTURACIÓN POR BODEGA */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900">Facturación por Bodega</h2>
            <span className="text-xs text-slate-500 font-semibold">
              Participación sobre facturación vigente
            </span>
          </div>

          {warehouseStats.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">
              No hay bodegas registradas o con datos en este período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase">
                  <tr>
                    <th className="p-3.5">Bodega</th>
                    <th className="p-3.5">Participación</th>
                    <th className="p-3.5 text-right">Monto Vigente</th>
                    <th className="p-3.5 text-right text-blue-700">Neto Estimado</th>
                    <th className="p-3.5 text-right text-purple-700">IVA Débito</th>
                    <th className="p-3.5 text-center">Facturas</th>
                    <th className="p-3.5 text-right">Ticket Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {warehouseStats.map((w) => (
                    <tr key={w.warehouseId} className="hover:bg-slate-50/60 transition">
                      <td className="p-3.5 font-extrabold text-slate-900">
                        {w.warehouseName}
                        <span className="ml-1.5 text-[10px] text-slate-400 font-mono">({w.warehouseCode})</span>
                      </td>
                      <td className="p-3.5 w-48">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full"
                              style={{ width: `${Math.min(100, w.percentage)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-600 w-10 text-right">
                            {w.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-black text-slate-900">
                        {formatCLP(w.grossTotal)}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-blue-700">
                        {formatCLP(w.netEstimated)}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-purple-700">
                        {formatCLP(w.vatEstimated)}
                      </td>
                      <td className="p-3.5 text-center font-bold text-slate-800">
                        {w.invoiceCount}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-700">
                        {formatCLP(w.averageTicket)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* EVOLUCIÓN HISTÓRICA MENSUAL */}
        {monthlyHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">
              Evolución Mensual (Últimos 6 Meses)
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
              {monthlyHistory.map((item) => {
                const heightPct = Math.round((item.grossTotal / maxMonthlyVal) * 100);

                return (
                  <div
                    key={item.period}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-2 text-center"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-700">{item.label}</p>
                      <p className="text-sm font-black text-slate-900 mt-1">
                        {formatCLP(item.grossTotal)}
                      </p>
                    </div>

                    <div className="h-16 flex items-end justify-center gap-1.5 pt-2">
                      {/* Active bar */}
                      <div
                        className="w-4 bg-emerald-500 rounded-t transition-all"
                        style={{ height: `${Math.max(6, heightPct)}%` }}
                        title={`Facturado Vigente: ${formatCLP(item.grossTotal)}`}
                      />
                      {/* NC bar */}
                      {item.creditNotesTotal > 0 && (
                        <div
                          className="w-3 bg-rose-400 rounded-t transition-all"
                          style={{
                            height: `${Math.max(6, Math.round((item.creditNotesTotal / maxMonthlyVal) * 100))}%`,
                          }}
                          title={`Notas de Crédito: ${formatCLP(item.creditNotesTotal)}`}
                        />
                      )}
                    </div>

                    <p className="text-[10px] text-slate-500 font-semibold">
                      {item.invoiceCount} facturas
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
