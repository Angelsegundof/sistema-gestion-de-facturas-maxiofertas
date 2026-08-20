"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatCLP, calculateReconciliation, ReconciliationResult } from "@/domain/pricing";
import {
  SanitizedInvoiceRequest,
  RequestCorrectionReason,
  SanitizedUser,
  SanitizedDocument,
} from "@/domain/types";

const REASON_LABELS: Record<RequestCorrectionReason, string> = {
  INVALID_RUT: "RUT incorrecto / no válido",
  INVALID_LEGAL_NAME: "Razón social incorrecta",
  INVALID_BUSINESS_ACTIVITY: "Giro comercial incorrecto",
  WRONG_TOTAL: "Total no coincide",
  INCOMPLETE_PRODUCTS: "Productos incompletos",
  WRONG_PRICE: "Precio incorrecto",
  MISSING_INFORMATION: "Falta información",
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

  // Reconciliation state
  const [siiInput, setSiiInput] = useState<string>("");
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [reconciliationSaved, setReconciliationSaved] = useState<ReconciliationResult | null>(null);

  // Document Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<SanitizedDocument | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Finalization state
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

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
          const req: SanitizedInvoiceRequest = data.data.request;
          setRequestData(req);
          if (req.status === "COMPLETED") {
            setIsCompleted(true);
          }
          if (req.document) {
            setUploadedDocument(req.document);
          }
          if (req.siiGrossTotal) {
            setSiiInput(req.siiGrossTotal.toString());
            if (req.reconciliationStatus && req.grossDifference !== null && req.grossDifference !== undefined) {
              setReconciliationSaved({
                expectedGrossTotal: req.expectedGrossTotal,
                siiGrossTotal: req.siiGrossTotal,
                grossDifference: req.grossDifference,
                status: req.reconciliationStatus,
                canProceed: req.reconciliationStatus !== "MISMATCH",
                message:
                  req.reconciliationStatus === "MATCH"
                    ? "Los valores coinciden exactamente."
                    : req.reconciliationStatus === "ROUNDING_ACCEPTED"
                    ? `Diferencia de redondeo aceptada (${req.grossDifference > 0 ? `+${req.grossDifference}` : req.grossDifference} CLP).`
                    : `Los valores no coinciden (diferencia de ${req.grossDifference > 0 ? `+${req.grossDifference}` : req.grossDifference} CLP). Revisa los precios netos ingresados en el SII antes de continuar.`,
              });
            }
          }
        } else {
          setError(data.error?.message || "No se encontró la solicitud de factura.");
        }
      } catch {
        setError("Error de comunicación al consultar la solicitud.");
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

  // Live preview calculation when typing SII total
  const parsedSiiTotal = parseInt(siiInput.replace(/\D/g, ""), 10);
  let liveReconciliation: ReconciliationResult | null = null;
  if (requestData && !isNaN(parsedSiiTotal) && parsedSiiTotal > 0) {
    try {
      liveReconciliation = calculateReconciliation(requestData.expectedGrossTotal, parsedSiiTotal);
    } catch {
      liveReconciliation = null;
    }
  }

  const handleSaveReconciliation = async () => {
    if (!requestData || isNaN(parsedSiiTotal) || parsedSiiTotal <= 0) {
      setReconciliationError("Ingresa un monto válido mayor a 0.");
      return;
    }

    setReconciliationError(null);
    setReconciling(true);
    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siiGrossTotal: parsedSiiTotal }),
      });
      const data = await res.json();

      if (res.ok && data.success && data.data) {
        setRequestData(data.data.request);
        setReconciliationSaved(data.data.reconciliation);
      } else {
        setReconciliationError(data.error?.message || "Error al registrar la cuadratura.");
      }
    } catch {
      setReconciliationError("Error de conexi?n al guardar la cuadratura.");
    } finally {
      setReconciling(false);
    }
  };

  // PDF Upload Handler
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploadError(null);

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("El archivo debe ser un documento en formato PDF (.pdf).");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError("El archivo supera el tamaño máximo permitido de 2 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploadingPdf(true);
    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/document`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success && data.data?.document) {
        setUploadedDocument(data.data.document);
      } else {
        setUploadError(data.error?.message || "No pudimos subir la factura. Intenta nuevamente.");
      }
    } catch {
      setUploadError("Error de conexión al subir la factura.");
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Finalize Invoice Handler
  const handleFinalizeInvoice = async () => {
    setFinalizeError(null);
    setFinalizing(true);

    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (res.ok && data.success && data.data?.request) {
        setRequestData(data.data.request);
        setIsCompleted(true);
      } else {
        setFinalizeError(data.error?.message || "Error al finalizar la factura.");
      }
    } catch {
      setFinalizeError("Error de conexión al finalizar la factura.");
    } finally {
      setFinalizing(false);
    }
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
        setObservationError(data.error?.message || "Ocurrió un error al enviar la observación.");
      }
    } catch {
      setObservationError("Error de conexi?n al enviar la observación.");
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

  const activeReconciliation = liveReconciliation || reconciliationSaved;
  const isReconciliationValid =
    activeReconciliation &&
    (activeReconciliation.status === "MATCH" || activeReconciliation.status === "ROUNDING_ACCEPTED");
  const canFinalize = isReconciliationValid && uploadedDocument && !isCompleted;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link href="/gestion" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            ← Volver a pendientes
          </Link>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isCompleted
                  ? "bg-emerald-100 text-emerald-800"
                  : requestData.status === "IN_PROGRESS"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {isCompleted ? "Factura lista" : requestData.status === "IN_PROGRESS" ? "En proceso" : requestData.status}
            </span>
            {!isCompleted && (
              <span className="text-xs text-slate-500">
                {requestData.age ? `Esperando ${requestData.age.displayAge}` : ""}
              </span>
            )}
          </div>
        </div>

        {/* Success Banner when Completed */}
        {isCompleted && (
          <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-6 text-emerald-950 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-base">
              <span>✓</span>
              <span>Factura finalizada exitosamente</span>
            </div>
            <div className="text-xs text-emerald-900 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-emerald-700 block font-medium">Solicitud:</span>
                <span className="font-mono font-bold text-sm">{requestData.requestNumber}</span>
              </div>
              <div>
                <span className="text-emerald-700 block font-medium">Cliente:</span>
                <span className="font-bold">{requestData.customerLegalNameSnapshot}</span>
              </div>
              <div>
                <span className="text-emerald-700 block font-medium">Total facturado:</span>
                <span className="font-extrabold text-sm">{formatCLP(requestData.expectedGrossTotal)}</span>
              </div>
            </div>
            <div className="pt-2 flex flex-wrap gap-3">
              {uploadedDocument?.accessUrl && (
                <a
                  href={uploadedDocument.accessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
                >
                  <span>📄</span>
                  <span>Ver factura emitida (PDF)</span>
                </a>
              )}
              <Link
                href="/gestion"
                className="py-2 px-4 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold rounded-xl transition"
              >
                Volver a la cola
              </Link>
            </div>
          </div>
        )}

        {/* Main Worktable Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-8">
          {/* Header Solicitud */}
          <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mesa de Trabajo — Ejecutor</p>
              <h1 className="text-3xl font-extrabold text-slate-900 font-mono mt-1">{requestData.requestNumber}</h1>
              <p className="text-xs text-slate-500 mt-1">
                Bodega {requestData.warehouse?.name || "Central"} • Solicitada por {requestData.requesterName}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyAllMainData}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition flex items-center gap-1.5"
              >
                <span>📋</span>
                <span>{copiedField === "Datos principales" ? "✓ Datos copiados" : "Copiar datos principales"}</span>
              </button>

              <a
                href="https://www.sii.cl"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <span>↗</span>
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
                <span className="text-xs font-bold text-emerald-600 animate-pulse">✓ {copiedField} copiado</span>
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
                  {copiedField === "RUT" ? "✓ Copiado" : "Copiar RUT"}
                </button>
              </div>

              <div className="bg-white p-3.5 rounded-lg border border-slate-200 relative group">
                <span className="text-xs font-semibold text-slate-500 block mb-1">Razón social</span>
                <span className="font-bold text-slate-900 text-sm block truncate" title={requestData.customerLegalNameSnapshot}>
                  {requestData.customerLegalNameSnapshot}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(requestData.customerLegalNameSnapshot, "Razón Social")}
                  className="mt-2 w-full py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded transition"
                >
                  {copiedField === "Razón Social" ? "✓ Copiado" : "Copiar Razón Social"}
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
                  {copiedField === "Giro" ? "✓ Copiado" : "Copiar Giro"}
                </button>
              </div>
            </div>
          </div>

          {/* Bloque 2: Productos y Precios Netos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                2. Productos para ingresar en el SII
              </h2>
              <span className="text-xs text-slate-500">Copia el Precio Neto calculado para ingresar en SII</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Descripción del producto</th>
                    <th className="py-3 px-4 text-center">Cant.</th>
                    <th className="py-3 px-4 text-right">Precio Solicitado (IVA incl.)</th>
                    <th className="py-3 px-4 text-right bg-blue-50/70 text-blue-950 font-bold">
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
                      <td className="py-3 px-4 text-right bg-blue-50/40">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono font-extrabold text-blue-900 text-sm">
                            {formatCLP(item.unitPriceNet)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(item.unitPriceNet.toString(), "Precio neto")
                            }
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs transition shadow-sm"
                            title="Copiar precio neto para SII"
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

          {/* Bloque 3: Total esperado y Cuadratura SII */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Total que debe dar en SII */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 flex flex-col justify-between shadow-sm">
              <div>
                <p className="text-xs uppercase text-slate-400 font-bold tracking-wider">
                  TOTAL QUE DEBE DAR EN SII
                </p>
                <p className="text-4xl font-extrabold text-emerald-400 my-2">
                  {formatCLP(requestData.expectedGrossTotal)}
                </p>
                <p className="text-xs text-slate-400">Todos los precios solicitados incluyen IVA (19%).</p>
              </div>

              {requestData.notes && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Observaciones del solicitante
                  </p>
                  <p className="text-xs text-slate-300 italic">{requestData.notes}</p>
                </div>
              )}
            </div>

            {/* Ingreso y Validación de Total SII */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-1">
                  3. Cuadratura del total SII
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Ingresa el total final calculado por el portal del SII para verificar la cuadratura.
                </p>

                <div className="space-y-2">
                  <label htmlFor="siiTotal" className="block text-xs font-bold text-slate-700">
                    Total mostrado por SII *
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-2.5 text-slate-400 text-base font-bold">$</span>
                      <input
                        id="siiTotal"
                        type="number"
                        min="1"
                        disabled={isCompleted}
                        value={siiInput}
                        onChange={(e) => setSiiInput(e.target.value)}
                        placeholder="Ej: 68000"
                        className="w-full pl-8 pr-3 py-2 text-base font-mono font-bold bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                      />
                    </div>
                    {!isCompleted && (
                      <button
                        type="button"
                        onClick={handleSaveReconciliation}
                        disabled={reconciling || isNaN(parsedSiiTotal) || parsedSiiTotal <= 0}
                        className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                      >
                        {reconciling ? "Guardando..." : "Guardar cuadratura"}
                      </button>
                    )}
                  </div>
                  {reconciliationError && (
                    <p className="text-xs text-rose-600 font-semibold">{reconciliationError}</p>
                  )}
                </div>
              </div>

              {/* Feedback de Cuadratura */}
              {activeReconciliation && (
                <div className="mt-2">
                  {activeReconciliation.status === "MATCH" && (
                    <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-emerald-900 space-y-1">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <span>✓</span>
                        <span>Los valores coinciden exactamente. (MATCH)</span>
                      </div>
                      <p className="text-xs text-emerald-800">
                        Solicitud: {formatCLP(activeReconciliation.expectedGrossTotal)} | SII:{" "}
                        {formatCLP(activeReconciliation.siiGrossTotal)} | Diferencia: $0
                      </p>
                    </div>
                  )}

                  {activeReconciliation.status === "ROUNDING_ACCEPTED" && (
                    <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-900 space-y-1">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <span>✓</span>
                        <span>Diferencia de redondeo aceptada. (ROUNDING_ACCEPTED)</span>
                      </div>
                      <p className="text-xs text-amber-800">
                        Solicitud: {formatCLP(activeReconciliation.expectedGrossTotal)} | SII:{" "}
                        {formatCLP(activeReconciliation.siiGrossTotal)} | Diferencia:{" "}
                        {activeReconciliation.grossDifference > 0
                          ? `+${formatCLP(activeReconciliation.grossDifference)}`
                          : formatCLP(activeReconciliation.grossDifference)}
                      </p>
                    </div>
                  )}

                  {activeReconciliation.status === "MISMATCH" && (
                    <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-900 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-rose-800">
                        <span>⚠</span>
                        <span>Los valores no coinciden (MISMATCH)</span>
                      </div>
                      <p className="text-xs text-rose-800">
                        Solicitud: {formatCLP(activeReconciliation.expectedGrossTotal)} | SII:{" "}
                        {formatCLP(activeReconciliation.siiGrossTotal)} | Diferencia:{" "}
                        {activeReconciliation.grossDifference > 0
                          ? `+${formatCLP(activeReconciliation.grossDifference)}`
                          : formatCLP(activeReconciliation.grossDifference)}
                      </p>
                      <p className="text-xs font-semibold text-rose-700 bg-white/70 p-2 rounded border border-rose-200">
                        Revisa los precios netos ingresados en el SII antes de continuar. La finalización normal está bloqueada mientras exista discrepancia superior a ±$2.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bloque 4: Carga y Gestión de Documento PDF de Factura */}
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">
              4. Factura emitida en SII (PDF)
            </h2>

            {/* Document upload zone or preview card */}
            {uploadedDocument ? (
              <div className="p-5 bg-emerald-50/60 border-2 border-emerald-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                    PDF
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{uploadedDocument.fileName}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ✓ Cargado
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tamaño: {(uploadedDocument.fileSize / 1024).toFixed(1)} KB • Almacenamiento seguro en R2
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {uploadedDocument.accessUrl && (
                    <a
                      href={uploadedDocument.accessUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5"
                    >
                      <span>📄</span>
                      <span>Ver factura</span>
                    </a>
                  )}

                  {!isCompleted && (
                    <>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="application/pdf,.pdf"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleFileUpload(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPdf}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition border border-slate-300 disabled:opacity-50"
                      >
                        {uploadingPdf ? "Subiendo..." : "Reemplazar"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition ${
                    isDragOver
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
                  }`}
                >
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl">
                    📄
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Factura generada en el SII</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    Arrastra aquí el PDF de la factura emitida o selecciónalo desde tu computador (Máx. 2 MB).
                  </p>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPdf}
                    className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                  >
                    {uploadingPdf ? "Subiendo archivo..." : "Seleccionar archivo PDF"}
                  </button>
                </div>
              </div>
            )}

            {uploadError && (
              <p className="mt-2 text-xs font-semibold text-rose-600">{uploadError}</p>
            )}
          </div>

          {/* Bloque 5: Finalización Transaccional */}
          {!isCompleted && (
            <div className="p-6 bg-slate-900 text-white rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-extrabold text-white">Todo listo para finalizar</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Verifica que la cuadratura y el documento PDF sean correctos antes de completar la solicitud.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleFinalizeInvoice}
                  disabled={!canFinalize || finalizing}
                  className="py-3 px-6 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {finalizing ? "Finalizando factura..." : "✓ Finalizar factura"}
                </button>
              </div>

              {/* Checklist de Requisitos */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span className="text-slate-300">Cliente: {requestData.customerLegalNameSnapshot.slice(0, 18)}...</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span className="text-slate-300">Total: {formatCLP(requestData.expectedGrossTotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={isReconciliationValid ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                    {isReconciliationValid ? "✓" : "○"}
                  </span>
                  <span className={isReconciliationValid ? "text-slate-300" : "text-amber-300"}>
                    Cuadratura: {isReconciliationValid ? "Correcta" : "Pendiente"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={uploadedDocument ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                    {uploadedDocument ? "✓" : "○"}
                  </span>
                  <span className={uploadedDocument ? "text-slate-300" : "text-amber-300"}>
                    Factura: {uploadedDocument ? "PDF cargado" : "Pendiente"}
                  </span>
                </div>
              </div>

              {finalizeError && (
                <div className="p-3 bg-rose-950/80 border border-rose-600 rounded-xl text-xs text-rose-200">
                  {finalizeError}
                </div>
              )}
            </div>
          )}

          {/* Bloque 6: Operaciones de Ejecutor (Observación) */}
          {!isCompleted && (
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setShowObservationModal(true)}
                className="w-full sm:w-auto py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <span>⚠</span>
                <span>Hay un problema con los datos</span>
              </button>

              <div className="text-xs text-slate-500 text-center sm:text-right">
                {currentUser?.role === "ADMIN" ? "Modo Supervisor / Admin" : `Asignado a: ${currentUser?.name}`}
              </div>
            </div>
          )}
        </div>

        {/* Modal de Observación */}
        {showObservationModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-bold text-slate-900">¿Qué necesita corregirse?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Indica el motivo para que el solicitante realice los ajustes necesarios.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowObservationModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {observationError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                  {observationError}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Motivo de observación *</label>
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
                  placeholder="Explica detalladamente qué dato debe corregir el solicitante..."
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
                  {submittingObservation ? "Enviando..." : "Enviar a corrección"}
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
