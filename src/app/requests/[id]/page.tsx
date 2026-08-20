"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatCLP } from "@/domain/pricing";
import {
  SanitizedInvoiceRequest,
  SanitizedRectification,
  InvoiceTimelineEvent,
  RectificationReason,
} from "@/domain/types";

const REASON_OPTIONS: { value: RectificationReason; label: string }[] = [
  { value: "RUT", label: "RUT del cliente incorrecto" },
  { value: "LEGAL_NAME", label: "Razón Social incorrecta" },
  { value: "BUSINESS_ACTIVITY", label: "Giro comercial incorrecto" },
  { value: "PRODUCT", label: "Producto o descripción incorrecta" },
  { value: "QUANTITY", label: "Cantidad de productos errónea" },
  { value: "PRICE", label: "Precio con IVA incorrecto" },
  { value: "TOTAL", label: "Monto total discordante" },
  { value: "OTHER", label: "Otro motivo de rectificación" },
];

export default function ViewInvoiceRequestPage() {
  const params = useParams();
  const requestId = params?.id as string;

  const [requestData, setRequestData] = useState<SanitizedInvoiceRequest | null>(null);
  const [timeline, setTimeline] = useState<InvoiceTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State for Requesting Rectification
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<RectificationReason>("RUT");
  const [comment, setComment] = useState("");
  const [submittingRect, setSubmittingRect] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = async () => {
    if (!requestId) return;
    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}`);
      const data = await res.json();
      if (data.success && data.data?.request) {
        setRequestData(data.data.request);
      } else {
        setError(data.error?.message || "No se encontró la solicitud de factura.");
      }

      // Load timeline
      const timeRes = await fetch(`/api/v1/invoice-requests/${requestId}/timeline`);
      const timeData = await timeRes.json();
      if (timeData.success && timeData.data?.events) {
        setTimeline(timeData.data.events);
      }
    } catch {
      setError("Error de comunicación al consultar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [requestId]);

  const handleSubmitRectification = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRect(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/rectification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: selectedReason,
          comment: comment.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setIsModalOpen(false);
        setComment("");
        await loadData();
      } else {
        setModalError(data.error?.message || "No fue posible registrar la solicitud de cambio.");
      }
    } catch {
      setModalError("Error de conexión al enviar la solicitud de cambio.");
    } finally {
      setSubmittingRect(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-600 font-semibold text-sm">Cargando solicitud...</p>
      </div>
    );
  }

  if (error || !requestData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <p className="text-rose-600 text-sm font-semibold mb-4">{error || "Solicitud no disponible."}</p>
          <Link
            href="/"
            className="inline-block py-2 px-4 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const latestCorrection = requestData.corrections?.[0];
  const activeRect = requestData.activeRectification;

  const getStatusBadge = () => {
    if (activeRect) {
      if (activeRect.status === "REQUESTED") {
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
            Cambio solicitado
          </span>
        );
      }
      if (["IN_PROGRESS", "CREDIT_NOTE_REGISTERED", "NEW_INVOICE_PENDING"].includes(activeRect.status)) {
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
            Corrigiendo factura
          </span>
        );
      }
    }

    switch (requestData.status) {
      case "PENDING":
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pendiente</span>;
      case "IN_PROGRESS":
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">En proceso</span>;
      case "NEEDS_CORRECTION":
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">Necesita corrección</span>;
      case "COMPLETED":
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Lista</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">{requestData.status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            ← Volver al inicio
          </Link>
          {getStatusBadge()}
        </div>

        {/* Active Rectification Banner */}
        {activeRect && (
          <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl p-6 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-purple-900 text-sm font-extrabold uppercase tracking-wider">
              <span>↻</span>
              <span>
                {activeRect.status === "REQUESTED"
                  ? "Cambio solicitado en revisión"
                  : "Factura en proceso de corrección"}
              </span>
            </div>
            <p className="text-xs text-purple-950">
              {activeRect.status === "REQUESTED"
                ? "Tu solicitud de cambio fue recibida por el equipo de facturación. En breve emitirán la Nota de Crédito de anulación y la nueva factura corregida."
                : "El equipo de facturación está emitiendo la Nota de Crédito en el SII para anular el documento anterior y emitir la nueva versión."}
            </p>
            {activeRect.comment && (
              <p className="text-xs text-purple-800 italic bg-white/70 p-2.5 rounded-lg border border-purple-200">
                &ldquo;{activeRect.comment}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Completed Action Banner with PDF link & Solicitar Cambio button */}
        {requestData.status === "COMPLETED" && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-800 text-sm font-bold uppercase tracking-wider">
                <span>✓</span>
                <span>Factura emitida y disponible</span>
              </div>

              {!activeRect && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="py-1.5 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 shadow-sm transition"
                >
                  Solicitar cambio
                </button>
              )}
            </div>

            <p className="text-xs text-emerald-900">
              Esta factura fue emitida por el equipo de facturación. Puedes visualizar o descargar el PDF oficial.
            </p>

            {requestData.document?.accessUrl && (
              <div className="pt-1 flex flex-col sm:flex-row gap-3">
                <a
                  href={requestData.document.accessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 py-2.5 px-5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-sm transition"
                >
                  <span>📄</span>
                  <span>Ver factura emitida (PDF)</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Needs Correction Action Banner */}
        {requestData.status === "NEEDS_CORRECTION" && (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-rose-800 text-sm font-bold uppercase tracking-wider">
              <span>⚠</span>
              <span>Esta solicitud necesita una corrección</span>
            </div>
            {latestCorrection && (
              <div className="text-xs text-slate-800 space-y-1">
                <p>
                  <strong className="text-slate-900">Motivo:</strong> {latestCorrection.reason}
                </p>
                {latestCorrection.comment && (
                  <p className="p-3 bg-white rounded-lg border border-rose-200 text-slate-700">
                    {latestCorrection.comment}
                  </p>
                )}
              </div>
            )}
            <Link
              href={`/requests/${requestData.id}/corregir`}
              className="inline-block py-2.5 px-5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition"
            >
              Corregir ahora
            </Link>
          </div>
        )}

        {/* Card Principal */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Número de Solicitud</p>
              <h1 className="text-2xl font-extrabold text-slate-900 font-mono mt-0.5">{requestData.requestNumber}</h1>
            </div>
            <div className="text-sm text-slate-500">
              Emitida: {new Date(requestData.createdAt).toLocaleString("es-CL")}
            </div>
          </div>

          {/* Datos del Cliente */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Datos del Cliente</h2>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">RUT:</span>
                <span className="font-semibold text-slate-900">{requestData.customerRutSnapshot}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Razón Social:</span>
                <span className="font-semibold text-slate-900">{requestData.customerLegalNameSnapshot}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Giro:</span>
                <span className="font-semibold text-slate-900">{requestData.customerBusinessActivitySnapshot}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Contacto:</span>
                <span className="font-semibold text-slate-900">
                  {requestData.customerPhoneSnapshot || "Sin teléfono"} / {requestData.customerEmailSnapshot || "Sin correo"}
                </span>
              </div>
            </div>
          </div>

          {/* Líneas de Productos */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Productos Solicitados</h2>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
              {requestData.items?.map((item) => (
                <div key={item.id} className="p-3 bg-white flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{item.description}</p>
                    <p className="text-slate-500">
                      {item.quantity} x {formatCLP(item.unitPriceGross)} (IVA incl.)
                    </p>
                  </div>
                  <div className="font-bold text-slate-900 text-sm">{formatCLP(item.lineTotalGross)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="bg-slate-900 text-white rounded-lg p-4 flex justify-between items-center">
            <div>
              <p className="text-xs uppercase text-slate-400 font-semibold">Total a facturar</p>
              <p className="text-xs text-slate-400">Precios IVA incluido</p>
            </div>
            <div className="text-2xl font-extrabold text-emerald-400">{formatCLP(requestData.expectedGrossTotal)}</div>
          </div>

          {requestData.notes && (
            <div>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observaciones</h2>
              <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                {requestData.notes}
              </p>
            </div>
          )}

          {/* Historial / Línea de Tiempo */}
          {timeline.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Historial de la Solicitud</h2>
              <div className="space-y-2">
                {timeline.map((evt) => (
                  <div key={evt.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{evt.title}</span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(evt.timestamp).toLocaleString("es-CL")}
                      </span>
                    </div>
                    {evt.description && <p className="text-slate-600">{evt.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <Link
              href="/solicitar"
              className="flex-1 text-center py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
            >
              + Solicitar otra factura
            </Link>
            <Link
              href="/"
              className="flex-1 text-center py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </div>

      {/* Modal: Solicitar Cambio */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Solicitar Corrección de Factura</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              ¿Qué información quedó incorrecta en la factura emitida? El equipo de facturación anulará la factura con
              una Nota de Crédito y emitirá la versión corregida.
            </p>

            <form onSubmit={handleSubmitRectification} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Motivo principal *</label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value as RectificationReason)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  {REASON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Detalle del cambio requerido (Opcional)
                </label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ej: El RUT correcto es 76.888.999-0 y la razón social es..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                  {modalError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRect}
                  className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                >
                  {submittingRect ? "Enviando..." : "Enviar solicitud de cambio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
