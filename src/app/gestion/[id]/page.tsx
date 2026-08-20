"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatCLP } from "@/domain/pricing";
import {
  SanitizedInvoiceRequest,
  RequestCorrectionReason,
  SanitizedUser,
} from "@/domain/types";

const REASON_LABELS: Record<RequestCorrectionReason, string> = {
  INVALID_RUT: "RUT incorrecto / no v?lido",
  INVALID_LEGAL_NAME: "Raz?n social incorrecta",
  INVALID_BUSINESS_ACTIVITY: "Giro comercial incorrecto",
  WRONG_TOTAL: "Total no coincide",
  INCOMPLETE_PRODUCTS: "Productos incompletos",
  WRONG_PRICE: "Precio incorrecto",
  MISSING_INFORMATION: "Falta informaci?n",
  TAX_DATA_INCONSISTENT: "Datos tributarios inconsistentes",
  DUPLICATE_REQUEST: "Solicitud duplicada",
  OTHER: "Otro",
};

export default function WorktablePage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.id as string;

  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [requestData, setRequestData] = useState<SanitizedInvoiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Copy feedback state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Observation Modal state
  const [showObservationModal, setShowObservationModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<RequestCorrectionReason>("INVALID_RUT");
  const [observationComment, setObservationComment] = useState("");
  const [submittingObservation, setSubmittingObservation] = useState(false);
  const [observationError, setObservationError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!requestId) return;
      try {
        const userRes = await fetch("/api/v1/auth/session");
        const userData = await userRes.json();
        if (userData.success && userData.data?.user) {
          setCurrentUser(userData.data.user);
        }

        const res = await fetch(`/api/v1/invoice-requests/${requestId}`);
        const data = await res.json();
        if (data.success && data.data?.request) {
          setRequestData(data.data.request);
        } else {
          setError(data.error?.message || "No se encontr? la solicitud de factura.");
        }
      } catch {
        setError("Error de comunicaci?n al consultar la solicitud.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [requestId]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const copyAllMainData = () => {
    if (!requestData) return;
    const itemsText = (requestData.items || [])
      .map((i) => `? ${i.description}: ${i.quantity} un. x ${formatCLP(i.unitPriceGross)} (Neto SII: ${formatCLP(i.unitPriceNet)})`)
      .join("\n");

    const block = `SOLICITUD: ${requestData.requestNumber}
RUT: ${requestData.customerRutSnapshot}
RAZ?N SOCIAL: ${requestData.customerLegalNameSnapshot}
GIRO: ${requestData.customerBusinessActivitySnapshot}
TOTAL: ${formatCLP(requestData.expectedGrossTotal)}
PRODUCTOS:
${itemsText}`;

    copyToClipboard(block, "Datos principales");
  };

  const handleSendObservation = async () => {
    setObservationError(null);
    if (selectedReason === "OTHER" && !observationComment.trim()) {
      setObservationError("Debes escribir un comentario cuando seleccionas el motivo 'Otro'.");
      return;
    }

    setSubmittingObservation(true);
    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/request-correction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: selectedReason,
          comment: observationComment.trim() || null,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/gestion");
      } else {
        setObservationError(data.error?.message || "Ocurri? un error al enviar la observaci?n.");
      }
    } catch {
      setObservationError("Error de conexi?n al enviar la observaci?n.");
    } finally {
      setSubmittingObservation(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-600">Cargando mesa de trabajo...</p>
      </div>
    );
  }

  if (error || !requestData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <p className="text-rose-600 text-sm font-semibold mb-4">{error || "Solicitud no disponible."}</p>
          <Link
            href="/gestion"
            className="inline-block py-2 px-4 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Volver a la cola
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link href="/gestion" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            ? Volver a pendientes
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              {requestData.status === "IN_PROGRESS" ? "En proceso" : requestData.status}
            </span>
            <span className="text-xs text-slate-500">
              {requestData.age ? `Esperando ${requestData.age.displayAge}` : ""}
            </span>
          </div>
        </div>

        {/* Main Worktable Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-8">
          {/* Header Solicitud */}
          <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mesa de Trabajo ? Ejecutor</p>
              <h1 className="text-3xl font-extrabold text-slate-900 font-mono mt-1">{requestData.requestNumber}</h1>
              <p className="text-xs text-slate-500 mt-1">
                Bodega {requestData.warehouse?.name || "Central"} ? Solicitada por {requestData.requesterName}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyAllMainData}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition flex items-center gap-1.5"
              >
                <span>??</span>
                <span>{copiedField === "Datos principales" ? "? Datos copiados" : "Copiar datos principales"}</span>
              </button>

              <a
                href="https://www.sii.cl"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <span>?</span>
                <span>Abrir SII</span>
              </a>
            </div>
          </div>

          {/* Bloque 1: Datos del Cliente para Facturar */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                1. Datos del cliente para emitir en SII
              </h2>
              {copiedField && copiedField !== "Datos principales" && (
                <span className="text-xs font-bold text-emerald-600 animate-pulse">? {copiedField} copiado</span>
              )}
            </div>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 relative group">
                <span className="text-xs font-semibold text-slate-500 block mb-1">RUT del cliente</span>
                <span className="font-mono font-bold text-slate-900 text-base">{requestData.customerRutSnapshot}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(requestData.customerRutSnapshot, "RUT")}
                  className="mt-2 w-full py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded transition"
                >
                  {copiedField === "RUT" ? "? Copiado" : "Copiar RUT"}
                </button>
              </div>

              <div className="bg-white p-3.5 rounded-lg border border-slate-200 relative group">
                <span className="text-xs font-semibold text-slate-500 block mb-1">Raz?n social</span>
                <span className="font-bold text-slate-900 text-sm block truncate" title={requestData.customerLegalNameSnapshot}>
                  {requestData.customerLegalNameSnapshot}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(requestData.customerLegalNameSnapshot, "Raz?n Social")}
                  className="mt-2 w-full py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded transition"
                >
                  {copiedField === "Raz?n Social" ? "? Copiado" : "Copiar Raz?n Social"}
                </button>
              </div>

              <div className="bg-white p-3.5 rounded-lg border border-slate-200 relative group">
                <span className="text-xs font-semibold text-slate-500 block mb-1">Giro comercial</span>
                <span className="font-bold text-slate-900 text-sm block truncate" title={requestData.customerBusinessActivitySnapshot}>
                  {requestData.customerBusinessActivitySnapshot}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(requestData.customerBusinessActivitySnapshot, "Giro")}
                  className="mt-2 w-full py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded transition"
                >
                  {copiedField === "Giro" ? "? Copiado" : "Copiar Giro"}
                </button>
              </div>
            </div>
          </div>

          {/* Bloque 2: Productos y Precios Netos */}
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">
              2. Productos para ingresar en el SII
            </h2>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Descripci?n del producto</th>
                    <th className="py-3 px-4 text-center">Cant.</th>
                    <th className="py-3 px-4 text-right">Precio Solicitado (IVA incl.)</th>
                    <th className="py-3 px-4 text-right bg-blue-50/50 text-blue-950 font-bold">
                      Precio Neto para SII
                    </th>
                    <th className="py-3 px-4 text-right">Total producto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {requestData.items?.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-400 font-mono">{item.lineNumber}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{item.description}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">{item.quantity}</td>
                      <td className="py-3 px-4 text-right text-slate-600">{formatCLP(item.unitPriceGross)}</td>
                      <td className="py-3 px-4 text-right bg-blue-50/30">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-mono font-bold text-blue-900 text-sm">
                            {formatCLP(item.unitPriceNet)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(item.unitPriceNet.toString(), `Precio neto #${item.lineNumber}`)
                            }
                            className="px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded font-semibold text-[10px] transition"
                            title="Copiar precio neto al portapapeles"
                          >
                            Copiar
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCLP(item.lineTotalGross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bloque 3: Total esperado y Observaciones */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            <div className="md:col-span-2 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Observaciones del solicitante</h3>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 min-h-[80px]">
                {requestData.notes || "Sin observaciones adicionales."}
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-xl p-5 text-center shadow-sm">
              <p className="text-xs uppercase text-slate-400 font-semibold">TOTAL QUE DEBE DAR EN SII</p>
              <p className="text-3xl font-extrabold text-emerald-400 my-1">{formatCLP(requestData.expectedGrossTotal)}</p>
              <p className="text-xs text-slate-400">Todos los precios incluyen IVA.</p>
            </div>
          </div>

          {/* Bloque 4: Operaciones de Ejecutor */}
          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setShowObservationModal(true)}
              className="w-full sm:w-auto py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <span>?</span>
              <span>Hay un problema con los datos</span>
            </button>

            <div className="text-xs text-slate-500 text-center sm:text-right">
              {currentUser?.role === "ADMIN" ? "Modo Supervisor / Admin" : `Asignado a: ${currentUser?.name}`}
            </div>
          </div>
        </div>

        {/* Modal de Observaci?n */}
        {showObservationModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-bold text-slate-900">?Qu? necesita corregirse?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Indica el motivo para que el solicitante realice los ajustes necesarios.
                  </p>
                </div>
                <button
                  onClick={() => setShowObservationModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ?
                </button>
              </div>

              {observationError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                  {observationError}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Motivo de observaci?n *</label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value as RequestCorrectionReason)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(REASON_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Comentario explicativo {selectedReason === "OTHER" ? "*" : "(opcional)"}
                </label>
                <textarea
                  rows={3}
                  value={observationComment}
                  onChange={(e) => setObservationComment(e.target.value)}
                  placeholder="Explica detalladamente qu? dato debe corregir el solicitante..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={2000}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSendObservation}
                  disabled={submittingObservation}
                  className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                >
                  {submittingObservation ? "Enviando..." : "Enviar a correcci?n"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowObservationModal(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
