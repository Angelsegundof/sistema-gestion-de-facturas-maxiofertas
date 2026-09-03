"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  formatCLP,
  calculateReconciliation,
  splitRequestItemsIntoDocuments,
  calculateRequiredDocuments,
  ReconciliationResult,
} from "@/domain/pricing";
import {
  SanitizedInvoiceRequest,
  RequestCorrectionReason,
  SanitizedUser,
  SanitizedDocument,
  SplitDocumentBlock,
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
  const [uploadingDocNumber, setUploadingDocNumber] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadErrorsByDoc, setUploadErrorsByDoc] = useState<Record<number, string>>({});
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

  // Initial Data Fetching
  useEffect(() => {
    async function fetchData() {
      try {
        const [meRes, reqRes] = await Promise.all([
          fetch("/api/v1/auth/me"),
          fetch(`/api/v1/invoice-requests/${requestId}`),
        ]);

        const meData = await meRes.json();
        const reqData = await reqRes.json();

        if (meData.success && meData.data?.user) {
          setCurrentUser(meData.data.user);
        }

        if (reqData.success && reqData.data?.request) {
          const req: SanitizedInvoiceRequest = reqData.data.request;
          setRequestData(req);

          if (req.document) {
            setUploadedDocument(req.document);
          }

          if (req.status === "COMPLETED") {
            setIsCompleted(true);
          }

          if (req.siiGrossTotal) {
            setSiiInput(req.siiGrossTotal.toString());
            setReconciliationSaved(
              calculateReconciliation(req.expectedGrossTotal, req.siiGrossTotal)
            );
          }
        } else {
          setError(reqData.error?.message || "No se pudo cargar la información de la solicitud.");
        }
      } catch {
        setError("Error de red al conectar con el servidor.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [requestId]);

  // Copy to Clipboard Utility
  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      // Fallback
      setCopiedField(`${fieldName} (Error al copiar)`);
    }
  };

  const copyAllMainData = () => {
    if (!requestData) return;
    const block = `RUT: ${requestData.customerRutSnapshot}\nRazón Social: ${requestData.customerLegalNameSnapshot}\nGiro: ${requestData.customerBusinessActivitySnapshot}`;
    copyToClipboard(block, "Datos principales");
  };

  // Live reconciliation calculation as executor types
  const parsedSiiGross = parseInt(siiInput.replace(/\D/g, ""), 10);
  const liveReconciliation: ReconciliationResult | null =
    requestData && !isNaN(parsedSiiGross) && parsedSiiGross > 0
      ? calculateReconciliation(requestData.expectedGrossTotal, parsedSiiGross)
      : null;

  // Save Reconciliation Handler
  const handleSaveReconciliation = async () => {
    if (!liveReconciliation) {
      setReconciliationError("Ingresa un monto bruto válido en pesos chilenos.");
      return;
    }

    setReconciliationError(null);
    setReconciling(true);

    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siiGrossTotal: liveReconciliation.siiGrossTotal }),
      });
      const data = await res.json();

      if (res.ok && data.success && data.data?.reconciliation) {
        setReconciliationSaved(data.data.reconciliation);
      } else {
        setReconciliationError(data.error?.message || "No se pudo guardar la cuadratura.");
      }
    } catch {
      setReconciliationError("Error de conexión al guardar la cuadratura.");
    } finally {
      setReconciling(false);
    }
  };

  // PDF Upload Handler
  const handleFileUpload = async (file: File, docNumber: number = 1) => {
    if (!file) return;
    setUploadError(null);
    setUploadErrorsByDoc((prev) => ({ ...prev, [docNumber]: "" }));

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      const err = "El archivo debe ser un documento en formato PDF (.pdf).";
      setUploadError(err);
      setUploadErrorsByDoc((prev) => ({ ...prev, [docNumber]: err }));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      const err = "El archivo supera el tamaño máximo permitido de 2 MB.";
      setUploadError(err);
      setUploadErrorsByDoc((prev) => ({ ...prev, [docNumber]: err }));
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentNumber", docNumber.toString());

    setUploadingPdf(true);
    setUploadingDocNumber(docNumber);

    try {
      const res = await fetch(`/api/v1/invoice-requests/${requestId}/document`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success && data.data?.document) {
        const newDoc: SanitizedDocument = data.data.document;
        setUploadedDocument(newDoc);
        setRequestData((prev) => {
          if (!prev) return prev;
          const prevDocs = prev.documents || (prev.document ? [prev.document] : []);
          const filtered = prevDocs.filter((d) => (d.documentNumber || 1) !== docNumber);
          const updatedDocs = [...filtered, newDoc].sort(
            (a, b) => (a.documentNumber || 1) - (b.documentNumber || 1)
          );
          return {
            ...prev,
            documents: updatedDocs,
            document: updatedDocs[0] || newDoc,
          };
        });
      } else {
        const err = data.error?.message || "No pudimos subir la factura. Intenta nuevamente.";
        setUploadError(err);
        setUploadErrorsByDoc((prev) => ({ ...prev, [docNumber]: err }));
      }
    } catch {
      const err = "Error de conexión al subir la factura.";
      setUploadError(err);
      setUploadErrorsByDoc((prev) => ({ ...prev, [docNumber]: err }));
    } finally {
      setUploadingPdf(false);
      setUploadingDocNumber(null);
    }
  };

  const handleDrop = (e: React.DragEvent, docNumber: number = 1) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0], docNumber);
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

  const splitBlocks = requestData
    ? splitRequestItemsIntoDocuments(
        requestData.items || [],
        requestData.documents || (uploadedDocument ? [uploadedDocument] : requestData.document ? [requestData.document] : [])
      )
    : [];
  const isSplit = splitBlocks.length > 1;
  const uploadedDocsCount = splitBlocks.filter((b) => b.document).length;
  const canFinalize = splitBlocks.length > 0 && uploadedDocsCount === splitBlocks.length && !isCompleted;

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
                  : requestData.status === "PENDING"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {isCompleted ? "Factura lista" : requestData.status === "IN_PROGRESS" ? "En proceso" : requestData.status === "PENDING" ? "Pendiente" : requestData.status}
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
              <span>
                {isSplit
                  ? `Facturación dividida finalizada exitosamente (${splitBlocks.length} documentos)`
                  : "Factura finalizada exitosamente"}
              </span>
            </div>
            <div className="text-xs text-emerald-900 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-emerald-700 block font-medium">Solicitud:</span>
                <span className="font-mono font-bold text-slate-900">{requestData.requestNumber}</span>
              </div>
              <div>
                <span className="text-emerald-700 block font-medium">Cliente:</span>
                <span className="font-bold text-slate-900">{requestData.customerLegalNameSnapshot}</span>
              </div>
              <div>
                <span className="text-emerald-700 block font-medium">Total Facturado:</span>
                <span className="font-mono font-bold text-emerald-900 text-sm">{formatCLP(requestData.expectedGrossTotal)}</span>
              </div>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-emerald-200">
              <span className="text-[11px] text-emerald-800">
                Estado: COMPLETED | {splitBlocks.length} documento(s) tributario(s) resguardado(s) en almacenamiento inmutable.
              </span>
              <Link
                href="/gestion"
                className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
              >
                Volver a la cola de trabajo →
              </Link>
            </div>
          </div>
        )}

        {/* Informative Split Invoicing Top Banner */}
        {isSplit && (
          <div className="p-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-sm shadow-sm">
                ✂️
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-indigo-950">
                  Facturación Dividida — {splitBlocks.length} Documentos Tributarios Requeridos
                </h3>
                <p className="text-xs text-indigo-800">
                  Esta solicitud contiene <strong>{requestData.items?.length} productos</strong>. Por el límite de 10 líneas del SII, debes emitir <strong>{splitBlocks.length} facturas</strong> y cargar sus respectivos PDFs.
                </p>
              </div>
            </div>
            <div className="text-xs font-bold text-indigo-900 bg-white/90 px-3 py-1.5 rounded-lg border border-indigo-200 shrink-0">
              {uploadedDocsCount === splitBlocks.length ? (
                <span className="text-emerald-700">✓ {uploadedDocsCount}/{splitBlocks.length} PDFs listos</span>
              ) : (
                <span>{uploadedDocsCount}/{splitBlocks.length} PDFs cargados</span>
              )}
            </div>
          </div>
        )}

        {/* Main Work Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          {/* Bloque 1: Datos del Cliente */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                1. Datos del cliente para factura
              </h2>
              <button
                type="button"
                onClick={copyAllMainData}
                className="self-start sm:self-auto py-1 px-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-semibold transition flex items-center gap-1.5"
              >
                <span>📋</span>
                <span>{copiedField === "Datos principales" ? "✓ Datos copiados" : "Copiar datos principales"}</span>
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-700">
                  Solicitud: <span className="font-mono text-blue-700">{requestData.requestNumber}</span>
                </span>
                <span className="text-xs text-slate-500">
                  Bodega: <strong className="text-slate-800">{requestData.warehouse?.name || "Santiago Central"}</strong>
                </span>
              </div>

              {copiedField && copiedField !== "Datos principales" && (
                <div className="py-1 px-2 bg-emerald-100 border border-emerald-300 rounded text-xs font-bold text-emerald-800 animate-pulse">
                  ✓ {copiedField.startsWith("Producto") ? "Producto copiado" : copiedField.startsWith("Cantidad") ? "Cantidad copiada" : copiedField.startsWith("Precio") ? "Precio neto copiado" : `${copiedField} copiado`}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* RUT */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">RUT</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">{requestData.customerRutSnapshot}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(requestData.customerRutSnapshot, "RUT")}
                    className="mt-2 py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition w-full text-center"
                  >
                    {copiedField === "RUT" ? "✓ Copiado" : "Copiar RUT"}
                  </button>
                </div>

                {/* Razón Social */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Razón Social</span>
                    <span className="font-semibold text-slate-900 text-xs line-clamp-2">{requestData.customerLegalNameSnapshot}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(requestData.customerLegalNameSnapshot, "Razón Social")}
                    className="mt-2 py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition w-full text-center"
                  >
                    {copiedField === "Razón Social" ? "✓ Copiado" : "Copiar Razón Social"}
                  </button>
                </div>

                {/* Giro */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Giro</span>
                    <span className="font-semibold text-slate-900 text-xs line-clamp-2">{requestData.customerBusinessActivitySnapshot}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(requestData.customerBusinessActivitySnapshot, "Giro")}
                    className="mt-2 py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition w-full text-center"
                  >
                    {copiedField === "Giro" ? "✓ Copiado" : "Copiar Giro"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bloque 2: Productos y Precios Netos (Separados por Bloque si isSplit) */}
          <div className="space-y-6">
            {splitBlocks.map((block) => {
              const isBlockDocUploaded = Boolean(block.document);
              const isUploadingThis = uploadingPdf && uploadingDocNumber === block.documentNumber;
              const blockError = uploadErrorsByDoc[block.documentNumber];

              return (
                <div
                  key={block.documentNumber}
                  className={`rounded-2xl border ${
                    isSplit ? "border-indigo-200 bg-indigo-50/20 p-5 space-y-4" : "border-slate-200 p-0 space-y-4"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">
                        {isSplit
                          ? `Documento ${block.documentNumber} de ${block.totalDocuments} (Factura SII)`
                          : "2. Productos para ingresar en el SII"}
                      </h2>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-semibold">
                        Líneas {block.startLine}–{block.endLine} ({block.itemCount} {block.itemCount === 1 ? "ítem" : "ítems"})
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex items-center gap-3">
                      <span>
                        Neto SII: <strong className="font-mono text-blue-900">{formatCLP(block.expectedNetTotal)}</strong>
                      </span>
                      <span>
                        Total Bruto: <strong className="font-mono text-slate-900">{formatCLP(block.expectedGrossTotal)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Tabla de Productos de este Bloque */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold uppercase border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Descripción del producto</th>
                          <th className="py-2.5 px-3 text-center">Cant.</th>
                          <th className="py-2.5 px-3 text-right">Precio Solicitado</th>
                          <th className="py-2.5 px-3 text-right bg-blue-50/70 text-blue-950 font-bold">
                            Precio Neto para SII
                          </th>
                          <th className="py-2.5 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {block.items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 text-slate-400 font-mono">{item.lineNumber}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              <div className="flex items-center justify-between gap-2">
                                <span className="line-clamp-2">{item.description}</span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(item.description, `Producto`)}
                                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium text-[11px] transition border border-slate-300 shrink-0"
                                  title="Copiar descripción"
                                >
                                  Copiar
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                              <div className="flex items-center justify-center gap-1">
                                <span>{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(item.quantity.toString(), `Cantidad`)}
                                  className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium text-[10px] transition border border-slate-300"
                                  title="Copiar cantidad"
                                >
                                  Copiar
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600">{formatCLP(item.unitPriceGross)}</td>
                            <td className="py-2.5 px-3 text-right bg-blue-50/40">
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-mono font-extrabold text-blue-900 text-xs">
                                  {formatCLP(item.unitPriceNet)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(item.unitPriceNet.toString(), "Precio neto")}
                                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[11px] transition shadow-xs"
                                  title="Copiar precio neto para SII"
                                >
                                  Copiar
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCLP(item.lineTotalGross)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Carga de Documento PDF para este bloque */}
                  <div className="pt-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      {isSplit ? `PDF Factura #${block.documentNumber}` : "4. Factura emitida en SII (PDF)"}
                    </h3>

                    {isBlockDocUploaded && block.document ? (
                      <div className="p-4 bg-emerald-50/70 border-2 border-emerald-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-xs">
                            📄
                          </div>
                          <div>
                            <span className="text-xs font-bold text-emerald-950 block">{block.document.fileName}</span>
                            <span className="text-[11px] text-emerald-700">
                              {(block.document.fileSize / 1024).toFixed(1)} KB | Documento #{block.documentNumber} cargado
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {block.document.accessUrl && (
                            <a
                              href={block.document.accessUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold transition"
                            >
                              Ver PDF ↗
                            </a>
                          )}

                          {!isCompleted && (
                            <label className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition border border-slate-300 cursor-pointer">
                              {isUploadingThis ? "Subiendo..." : "Reemplazar"}
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    handleFileUpload(e.target.files[0], block.documentNumber);
                                  }
                                }}
                                disabled={uploadingPdf}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragOver(true);
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={(e) => handleDrop(e, block.documentNumber)}
                        className="border-2 border-dashed border-slate-300 hover:border-slate-400 bg-white rounded-xl p-5 text-center transition"
                      >
                        <p className="text-xs font-bold text-slate-800 mb-1">
                          {isSplit
                            ? `Cargar Factura SII Documento #${block.documentNumber} (Líneas ${block.startLine}–${block.endLine})`
                            : "Arrastra aquí el PDF de la factura emitida en el SII o selecciónalo"}
                        </p>
                        <p className="text-[11px] text-slate-500 mb-3">Formato PDF, máx 2 MB.</p>

                        <label className="inline-block py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer">
                          {isUploadingThis ? "Subiendo archivo..." : `Seleccionar PDF Documento #${block.documentNumber}`}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleFileUpload(e.target.files[0], block.documentNumber);
                              }
                            }}
                            disabled={uploadingPdf}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}

                    {blockError && (
                      <p className="mt-1.5 text-xs font-semibold text-rose-600">{blockError}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bloque 3: Total esperado y Cuadratura SII */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Total que debe dar en SII */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 flex flex-col justify-between shadow-sm">
              <div>
                <p className="text-xs uppercase text-slate-400 font-bold tracking-wider">
                  TOTAL CONSOLIDADO A FACTURAR
                </p>
                <p className="text-4xl font-extrabold text-emerald-400 my-2">
                  {formatCLP(requestData.expectedGrossTotal)}
                </p>
                {isSplit && (
                  <div className="text-xs text-slate-300 space-y-1 font-mono pt-1">
                    {splitBlocks.map((b) => (
                      <div key={b.documentNumber} className="flex justify-between">
                        <span>• Factura #{b.documentNumber}:</span>
                        <span>{formatCLP(b.expectedGrossTotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-2">Todos los precios solicitados incluyen IVA (19%).</p>
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

            {/* Cuadratura Opcional SII */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    3. Cuadratura con Total SII (Opcional)
                  </h3>
                  <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-semibold">
                    Opcional
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Introduce el total consolidado generado en el SII para verificar que los precios netos coinciden.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-sm text-slate-400 font-bold">$</span>
                    <input
                      type="text"
                      placeholder="Ej: 125000"
                      value={siiInput}
                      onChange={(e) => setSiiInput(e.target.value)}
                      disabled={isCompleted}
                      className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  {!isCompleted && (
                    <button
                      type="button"
                      onClick={handleSaveReconciliation}
                      disabled={reconciling || !siiInput}
                      className="py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-40"
                    >
                      {reconciling ? "Verificando..." : "Comprobar"}
                    </button>
                  )}
                </div>

                {reconciliationError && (
                  <p className="text-xs text-rose-600 font-semibold">{reconciliationError}</p>
                )}
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
                    </div>
                  )}

                  {activeReconciliation.status === "MISMATCH" && (
                    <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-950 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-xs text-amber-900">
                        <span>⚠</span>
                        <span>El total ingresado no coincide</span>
                      </div>
                      <div className="text-xs text-amber-900 grid grid-cols-3 gap-2 py-1 font-mono">
                        <div>
                          <span className="text-slate-500 font-sans block text-[10px] uppercase font-bold">Sistema:</span>
                          <span className="font-bold">{formatCLP(activeReconciliation.expectedGrossTotal)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-sans block text-[10px] uppercase font-bold">SII:</span>
                          <span className="font-bold">{formatCLP(activeReconciliation.siiGrossTotal)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-sans block text-[10px] uppercase font-bold">Diferencia:</span>
                          <span className="font-bold text-amber-800">
                            {activeReconciliation.grossDifference > 0
                              ? `+${formatCLP(activeReconciliation.grossDifference)}`
                              : formatCLP(activeReconciliation.grossDifference)}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-amber-800 bg-white/80 p-2 rounded border border-amber-200">
                        Revisa los datos ingresados en el SII antes de continuar.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bloque 5: Finalización Transaccional */}
          {!isCompleted && (
            <div className="p-6 bg-slate-900 text-white rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-extrabold text-white">Todo listo para finalizar</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isSplit
                      ? `Verifica que los ${splitBlocks.length} PDFs de las facturas estén cargados correctamente antes de finalizar.`
                      : "Verifica que la cuadratura y el documento PDF sean correctos antes de completar la solicitud."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleFinalizeInvoice}
                  disabled={!canFinalize || finalizing}
                  className="py-3 px-6 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {finalizing ? "Finalizando factura..." : "✓ Finalizar facturación"}
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
                  <span className={uploadedDocsCount === splitBlocks.length ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                    {uploadedDocsCount === splitBlocks.length ? "✓" : "○"}
                  </span>
                  <span className={uploadedDocsCount === splitBlocks.length ? "text-slate-300" : "text-amber-300 font-bold"}>
                    PDFs: {uploadedDocsCount} / {splitBlocks.length} listos
                  </span>
                </div>
              </div>

              {uploadedDocsCount < splitBlocks.length && (
                <div className="p-3 bg-amber-950/60 border border-amber-600/70 rounded-xl text-xs text-amber-200">
                  ℹ️ <strong>Carga pendiente:</strong> Debes subir los PDFs de los <strong>{splitBlocks.length} documentos</strong> ({uploadedDocsCount} cargados) para habilitar la finalización.
                </div>
              )}

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
