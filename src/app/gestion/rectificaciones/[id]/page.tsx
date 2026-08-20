"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatCLP, calculateReconciliation } from "@/domain/pricing";
import {
  SanitizedUser,
  SanitizedRectification,
  SanitizedInvoiceRequest,
  RectificationReason,
  ReconciliationStatus,
} from "@/domain/types";

const REASON_LABELS: Record<RectificationReason, string> = {
  RUT: "RUT incorrecto",
  LEGAL_NAME: "Razón social incorrecta",
  BUSINESS_ACTIVITY: "Giro incorrecto",
  PRODUCT: "Producto incorrecto",
  QUANTITY: "Cantidad incorrecta",
  PRICE: "Precio incorrecto",
  TOTAL: "Total incorrecto",
  OTHER: "Otro motivo",
};

export default function MesaRectificacionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [rectification, setRectification] = useState<SanitizedRectification | null>(null);
  const [requestData, setRequestData] = useState<SanitizedInvoiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Stage 1: Credit Note State
  const [cnFolio, setCnFolio] = useState("");
  const [cnFile, setCnFile] = useState<File | null>(null);
  const [uploadingCn, setUploadingCn] = useState(false);
  const [cnError, setCnError] = useState<string | null>(null);
  const cnFileInputRef = useRef<HTMLInputElement>(null);

  // Stage 2: Replacement Invoice State
  const [siiInput, setSiiInput] = useState<string>("");
  const [newInvFile, setNewInvFile] = useState<File | null>(null);
  const [uploadingNewInv, setUploadingNewInv] = useState(false);
  const [newInvError, setNewInvError] = useState<string | null>(null);
  const newInvFileInputRef = useRef<HTMLInputElement>(null);

  // Stage 3: Finalize State
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // Load Session & Rectification Data
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
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
          router.push("/");
          return;
        }
        setCurrentUser(user);

        // Fetch Rectification
        const rectRes = await fetch(`/api/v1/rectifications/${id}`);
        const rectJson = await rectRes.json();
        if (!isMounted) return;

        if (!rectJson.success || !rectJson.data?.rectification) {
          setPageError(rectJson.error?.message || "No se pudo cargar la rectificación.");
          setLoading(false);
          return;
        }

        const r: SanitizedRectification = rectJson.data.rectification;
        setRectification(r);

        // Fetch parent invoice request
        const reqRes = await fetch(`/api/v1/invoice-requests/${r.invoiceRequestId}`);
        const reqJson = await reqRes.json();
        if (isMounted && reqJson.success && reqJson.data?.request) {
          setRequestData(reqJson.data.request);
          if (r.siiGrossTotal) {
            setSiiInput(String(r.siiGrossTotal));
          }
        }
      } catch {
        if (isMounted) setPageError("Error de conexión al cargar datos.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [id, router]);

  const refreshRectification = async () => {
    try {
      const res = await fetch(`/api/v1/rectifications/${id}`);
      const data = await res.json();
      if (data.success && data.data?.rectification) {
        setRectification(data.data.rectification);
      }
    } catch {
      // ignore
    }
  };

  // Handler: Claim Rectification
  const handleClaim = async () => {
    try {
      const res = await fetch(`/api/v1/rectifications/${id}/claim`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success && data.data?.rectification) {
        setRectification(data.data.rectification);
      } else {
        setPageError(data.error?.message || "No fue posible tomar la rectificación.");
      }
    } catch {
      setPageError("Error de conexión al tomar la rectificación.");
    }
  };

  // Handler: Register Credit Note
  const handleRegisterCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnFile) {
      setCnError("Debes seleccionar el archivo PDF de la Nota de Crédito.");
      return;
    }

    setUploadingCn(true);
    setCnError(null);

    const formData = new FormData();
    formData.append("file", cnFile);
    if (cnFolio.trim()) {
      formData.append("folio", cnFolio.trim());
    }

    try {
      const res = await fetch(`/api/v1/rectifications/${id}/credit-note`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setCnFile(null);
        await refreshRectification();
      } else {
        setCnError(data.error?.message || "Error al registrar la Nota de Crédito.");
      }
    } catch {
      setCnError("Error de red al subir la Nota de Crédito.");
    } finally {
      setUploadingCn(false);
    }
  };

  // Handler: Upload Replacement Invoice
  const handleUploadReplacementInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvFile) {
      setNewInvError("Debes seleccionar el archivo PDF de la nueva factura.");
      return;
    }

    setUploadingNewInv(true);
    setNewInvError(null);

    const formData = new FormData();
    formData.append("file", newInvFile);
    if (siiInput.trim()) {
      formData.append("siiGrossTotal", siiInput.trim());
    }

    try {
      const res = await fetch(`/api/v1/rectifications/${id}/replacement-invoice`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setNewInvFile(null);
        await refreshRectification();
      } else {
        setNewInvError(data.error?.message || "Error al cargar la nueva factura.");
      }
    } catch {
      setNewInvError("Error de red al subir la nueva factura.");
    } finally {
      setUploadingNewInv(false);
    }
  };

  // Handler: Finalize Rectification
  const handleFinalize = async () => {
    setFinalizing(true);
    setFinalizeError(null);

    try {
      const res = await fetch(`/api/v1/rectifications/${id}/complete`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success && data.data?.rectification) {
        setRectification(data.data.rectification);
      } else {
        setFinalizeError(data.error?.message || "Error al finalizar la rectificación.");
      }
    } catch {
      setFinalizeError("Error de conexión al finalizar la corrección.");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Cargando mesa de rectificación...</p>
        </div>
      </div>
    );
  }

  if (pageError || !rectification || !requestData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full space-y-4 text-center">
          <div className="text-rose-500 text-3xl">⚠</div>
          <h2 className="text-base font-bold text-slate-900">No se pudo acceder a la corrección</h2>
          <p className="text-xs text-slate-600">{pageError || "Registro no encontrado."}</p>
          <Link
            href="/gestion"
            className="inline-block py-2 px-4 bg-slate-900 text-white text-xs font-bold rounded-xl"
          >
            ← Volver a la cola
          </Link>
        </div>
      </div>
    );
  }

  const isCompleted = rectification.status === "COMPLETED";
  const hasCreditNote = !!rectification.creditNoteDocumentId || !!rectification.creditNoteId;
  const hasReplacementInvoice = !!rectification.replacementInvoiceDocumentId;

  // Real-time Reconciliation calculation
  const enteredNumber = parseInt(siiInput, 10);
  const recon =
    !isNaN(enteredNumber) && enteredNumber > 0
      ? calculateReconciliation(requestData.expectedGrossTotal, enteredNumber)
      : null;

  const reconStatus: ReconciliationStatus | null =
    rectification.reconciliationStatus || recon?.status || null;
  const isReconValid = reconStatus === "MATCH" || reconStatus === "ROUNDING_ACCEPTED";
  const canFinalize = hasCreditNote && hasReplacementInvoice && isReconValid && !isCompleted;

  const isAssignedToMe = rectification.assignedTo === currentUser?.id || currentUser?.role === "ADMIN";
  const isUnassigned = !rectification.assignedTo && rectification.status === "REQUESTED";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/gestion"
            className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
          >
            <span>←</span>
            <span>Volver a la cola de facturación</span>
          </Link>

          <span className="text-xs font-semibold px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg">
            Proceso de Rectificación V1
          </span>
        </div>

        {/* Top Header Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Corrección de Factura
              </p>
              <h1 className="text-2xl font-black text-slate-900">{requestData.requestNumber}</h1>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1.5 bg-slate-100 text-slate-800 rounded-xl">
                Estado: {rectification.status}
              </span>
              {isCompleted && (
                <span className="text-xs font-extrabold px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl">
                  ✓ Factura Corregida
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Esta factura ya fue emitida previamente. Para corregirla y emitir la versión definitiva, debes registrar
            primero la Nota de Crédito en el SII para anular el documento anterior.
          </p>

          {isUnassigned && (
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700">
                ⚠ Esta rectificación aún no está tomada.
              </span>
              <button
                type="button"
                onClick={handleClaim}
                className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition"
              >
                Tomar corrección ahora
              </button>
            </div>
          )}
        </div>

        {/* Factura Original y Cambio Solicitado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Factura Original */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              1. Factura Original Emitida
            </h2>
            <div className="space-y-1.5 text-xs">
              <p>
                <strong className="text-slate-600">Cliente:</strong>{" "}
                <span className="font-semibold text-slate-900">{requestData.customerLegalNameSnapshot}</span>
              </p>
              <p>
                <strong className="text-slate-600">RUT:</strong>{" "}
                <span className="font-semibold text-slate-900">{requestData.customerRutSnapshot}</span>
              </p>
              <p>
                <strong className="text-slate-600">Giro:</strong>{" "}
                <span className="text-slate-700">{requestData.customerBusinessActivitySnapshot}</span>
              </p>
              <p>
                <strong className="text-slate-600">Total Facturado:</strong>{" "}
                <span className="font-extrabold text-slate-900">
                  {formatCLP(requestData.expectedGrossTotal)}
                </span>
              </p>
            </div>

            {rectification.originalInvoiceDocument?.accessUrl && (
              <div className="pt-2">
                <a
                  href={rectification.originalInvoiceDocument.accessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition"
                >
                  <span>📄 Ver factura original emitida</span>
                </a>
              </div>
            )}
          </div>

          {/* Cambio Solicitado */}
          <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-5 space-y-3">
            <h2 className="text-xs font-bold uppercase text-amber-800 tracking-wider">
              2. Cambio Solicitado por Bodega
            </h2>
            <div className="space-y-1.5 text-xs">
              <p>
                <strong className="text-amber-900">Motivo:</strong>{" "}
                <span className="font-bold text-amber-950">
                  {REASON_LABELS[rectification.reason] || rectification.reason}
                </span>
              </p>
              <p>
                <strong className="text-amber-900">Comentario del solicitante:</strong>
              </p>
              <div className="p-2.5 bg-white/90 rounded-xl border border-amber-200 text-xs text-slate-800 italic">
                &ldquo;{rectification.comment || "Sin comentarios adicionales."}&rdquo;
              </div>
              <p className="text-[11px] text-amber-700 pt-1">
                Solicitado el: {new Date(rectification.requestedAt).toLocaleString("es-CL")}
              </p>
            </div>
          </div>
        </div>

        {/* ETAPA 1: NOTA DE CRÉDITO */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${
                  hasCreditNote
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-900 text-white"
                }`}
              >
                {hasCreditNote ? "✓" : "1"}
              </div>
              <h2 className="text-base font-extrabold text-slate-900">
                Etapa 1: Registrar Nota de Crédito (Anulación)
              </h2>
            </div>

            {hasCreditNote && (
              <span className="text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
                ✓ Nota de Crédito Registrada
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600">
            Genera la Nota de Crédito por anulación completa en el sitio del SII por el monto total (
            <strong>{formatCLP(requestData.expectedGrossTotal)}</strong>). Luego carga el PDF descargado para anular
            la factura anterior.
          </p>

          {!hasCreditNote ? (
            <form onSubmit={handleRegisterCreditNote} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Folio NC (Opcional)</label>
                  <input
                    type="text"
                    value={cnFolio}
                    onChange={(e) => setCnFolio(e.target.value)}
                    placeholder="Ej: 1420"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Archivo PDF de Nota de Crédito *</label>
                  <input
                    type="file"
                    ref={cnFileInputRef}
                    accept="application/pdf"
                    onChange={(e) => setCnFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
                  />
                </div>
              </div>

              {cnError && <p className="text-xs font-bold text-rose-600">{cnError}</p>}

              <button
                type="submit"
                disabled={uploadingCn || !cnFile || !isAssignedToMe}
                className="py-2.5 px-5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-40"
              >
                {uploadingCn ? "Registrando Nota de Crédito..." : "Registrar Nota de Crédito y Anular Factura"}
              </button>
            </form>
          ) : (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="text-xs text-emerald-900 space-y-0.5">
                <p className="font-bold">✓ Factura anterior marcada como anulada</p>
                <p className="text-slate-600">
                  {rectification.creditNote?.siiFolio
                    ? `Folio NC: ${rectification.creditNote.siiFolio}`
                    : "Nota de Crédito archivada en Cloudflare R2"}
                </p>
              </div>

              {rectification.creditNoteDocument?.accessUrl && (
                <a
                  href={rectification.creditNoteDocument.accessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-emerald-800 hover:underline bg-white px-3 py-1.5 rounded-lg border border-emerald-300"
                >
                  Ver PDF de Nota de Crédito ↗
                </a>
              )}
            </div>
          )}
        </div>

        {/* ETAPA 2: NUEVA FACTURA */}
        <div
          className={`bg-white rounded-2xl shadow-sm border p-6 space-y-4 transition-all ${
            hasCreditNote ? "border-slate-200" : "border-slate-100 opacity-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${
                  hasReplacementInvoice
                    ? "bg-emerald-500 text-white"
                    : hasCreditNote
                    ? "bg-slate-900 text-white"
                    : "bg-slate-300 text-slate-600"
                }`}
              >
                {hasReplacementInvoice ? "✓" : "2"}
              </div>
              <h2 className="text-base font-extrabold text-slate-900">
                Etapa 2: Emitir y Cuadrar Nueva Factura
              </h2>
            </div>

            {hasReplacementInvoice && (
              <span className="text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
                ✓ Nueva Factura Cargada
              </span>
            )}
          </div>

          {hasCreditNote && (
            <>
              {/* Pricing & Net details table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Descripción</th>
                      <th className="p-3 text-center">Cant</th>
                      <th className="p-3 text-right">Precio con IVA</th>
                      <th className="p-3 text-right text-blue-700">Neto para SII</th>
                      <th className="p-3 text-right">Total Línea</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requestData.items?.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-500">{item.lineNumber}</td>
                        <td className="p-3 font-medium text-slate-900">{item.description}</td>
                        <td className="p-3 text-center font-bold">{item.quantity}</td>
                        <td className="p-3 text-right font-semibold">{formatCLP(item.unitPriceGross)}</td>
                        <td className="p-3 text-right font-bold text-blue-700">
                          {formatCLP(item.unitPriceNet)}
                        </td>
                        <td className="p-3 text-right font-extrabold text-slate-900">
                          {formatCLP(item.lineTotalGross)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                    <tr>
                      <td colSpan={4} className="p-3 text-right">
                        Total Esperado (IVA incluido):
                      </td>
                      <td colSpan={2} className="p-3 text-right text-sm font-black text-slate-900">
                        {formatCLP(requestData.expectedGrossTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Upload New Invoice PDF & SII input */}
              {!isCompleted && (
                <form onSubmit={handleUploadReplacementInvoice} className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">
                        Total mostrado por SII (CLP) *
                      </label>
                      <input
                        type="number"
                        value={siiInput}
                        onChange={(e) => setSiiInput(e.target.value)}
                        placeholder={`Ej: ${requestData.expectedGrossTotal}`}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                      />

                      {/* Live Cuadratura Indicator */}
                      {recon && (
                        <div
                          className={`mt-1.5 p-2 rounded-lg text-xs font-bold flex items-center justify-between ${
                            recon.status === "MATCH"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                              : recon.status === "ROUNDING_ACCEPTED"
                              ? "bg-amber-50 text-amber-800 border border-amber-300"
                              : "bg-rose-50 text-rose-800 border border-rose-300"
                          }`}
                        >
                          <span>
                            {recon.status === "MATCH"
                              ? "✓ Cuadratura exacta (MATCH)"
                              : recon.status === "ROUNDING_ACCEPTED"
                              ? `✓ Diferencia aceptada (±${recon.grossDifference} CLP)`
                              : `⚠ Discrepancia (${recon.grossDifference > 0 ? "+" : ""}${recon.grossDifference} CLP)`}
                          </span>
                          <span>{formatCLP(recon.siiGrossTotal)}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">
                        Archivo PDF de la Nueva Factura *
                      </label>
                      <input
                        type="file"
                        ref={newInvFileInputRef}
                        accept="application/pdf"
                        onChange={(e) => setNewInvFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
                      />
                    </div>
                  </div>

                  {newInvError && <p className="text-xs font-bold text-rose-600">{newInvError}</p>}

                  <button
                    type="submit"
                    disabled={uploadingNewInv || !newInvFile || !isAssignedToMe}
                    className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-40"
                  >
                    {uploadingNewInv ? "Subiendo nueva factura..." : "Cargar y Validar Nueva Factura"}
                  </button>
                </form>
              )}

              {hasReplacementInvoice && rectification.replacementInvoiceDocument?.accessUrl && (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                  <div className="text-xs text-blue-950 font-semibold">
                    ✓ Nueva factura cargada ({rectification.replacementInvoiceDocument.fileName})
                  </div>
                  <a
                    href={rectification.replacementInvoiceDocument.accessUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-blue-800 hover:underline bg-white px-3 py-1.5 rounded-lg border border-blue-300"
                  >
                    Ver nueva factura emitida ↗
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {/* ETAPA 3: FINALIZAR CORRECCIÓN */}
        {!isCompleted ? (
          <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-extrabold text-white">3. Finalizar Rectificación</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Verifica que la Nota de Crédito y la nueva factura estén registradas con cuadratura válida.
                </p>
              </div>

              <button
                type="button"
                onClick={handleFinalize}
                disabled={!canFinalize || finalizing || !isAssignedToMe}
                className="py-3 px-6 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {finalizing ? "Finalizando..." : "✓ Finalizar corrección"}
              </button>
            </div>

            {/* Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <span className={hasCreditNote ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                  {hasCreditNote ? "✓" : "○"}
                </span>
                <span className={hasCreditNote ? "text-slate-200" : "text-amber-300"}>
                  1. Nota de Crédito {hasCreditNote ? "OK" : "Pendiente"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={hasReplacementInvoice ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                  {hasReplacementInvoice ? "✓" : "○"}
                </span>
                <span className={hasReplacementInvoice ? "text-slate-200" : "text-amber-300"}>
                  2. Nueva factura {hasReplacementInvoice ? "Cargada" : "Pendiente"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={isReconValid ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                  {isReconValid ? "✓" : "○"}
                </span>
                <span className={isReconValid ? "text-slate-200" : "text-amber-300"}>
                  3. Cuadratura {isReconValid ? "Válida" : "Pendiente"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span className="text-slate-200">
                  {currentUser?.role === "ADMIN" ? "Supervisor Admin" : `Asignado: ${currentUser?.name}`}
                </span>
              </div>
            </div>

            {finalizeError && (
              <div className="p-3 bg-rose-950/80 border border-rose-600 rounded-xl text-xs text-rose-200">
                {finalizeError}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-emerald-900 text-white rounded-2xl p-6 space-y-2 text-center">
            <h3 className="text-lg font-black text-emerald-200">✓ Factura Corregida y Rectificación Finalizada</h3>
            <p className="text-xs text-emerald-100">
              La factura original quedó anulada con su Nota de Crédito y la nueva factura corregida está disponible
              para el solicitante.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
