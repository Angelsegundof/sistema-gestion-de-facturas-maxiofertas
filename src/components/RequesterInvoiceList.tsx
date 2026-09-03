"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { SanitizedInvoiceRequest } from "@/domain/types";
import { formatWhatsAppInvoiceMessage } from "@/domain/whatsapp";
import { formatCLP } from "@/domain/pricing";
import EditPendingRequestModal from "@/components/EditPendingRequestModal";

type RequesterStatusTab = "ALL" | "PENDING" | "NEEDS_CORRECTION" | "IN_PROGRESS" | "COMPLETED";

export default function RequesterInvoiceList() {
  const [requests, setRequests] = useState<SanitizedInvoiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedDocLinkId, setCopiedDocLinkId] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [contactModalReq, setContactModalReq] = useState<SanitizedInvoiceRequest | null>(null);
  const [docsModalReq, setDocsModalReq] = useState<SanitizedInvoiceRequest | null>(null);
  const [editingRequest, setEditingRequest] = useState<SanitizedInvoiceRequest | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [selectedTab, setSelectedTab] = useState<RequesterStatusTab>("ALL");

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/v1/invoice-requests/mine?pageSize=100");
        const data = await res.json();
        if (!isMounted) return;
        if (data.success && data.data?.requests) {
          setRequests(data.data.requests);
        } else {
          setError(data.error?.message || "No se pudieron cargar tus solicitudes.");
        }
      } catch {
        if (isMounted) setError("Error de red al consultar solicitudes.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [refreshIndex]);

  const handleRefresh = () => {
    setRefreshIndex((prev) => prev + 1);
  };

  const getOrFetchShareUrl = async (documentId: string): Promise<string | null> => {
    const res = await fetch(`/api/v1/documents/${documentId}/share`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.success && data.data?.shareUrl) {
      return data.data.shareUrl;
    }
    return null;
  };

  const handleCopyLink = async (requestId: string, documentId?: string) => {
    if (!documentId) return;
    setSharingId(requestId);
    try {
      const shareUrl = await getOrFetchShareUrl(documentId);
      if (shareUrl) {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedLinkId(requestId);
        setTimeout(() => setCopiedLinkId(null), 3000);
      }
    } catch (err) {
      console.error("Error al copiar enlace:", err);
    } finally {
      setSharingId(null);
    }
  };

  const handleCopyMessage = async (
    requestId: string,
    customerName: string,
    documentId?: string,
    allDocs?: { id: string; documentNumber?: number }[]
  ) => {
    setSharingId(requestId);
    try {
      if (allDocs && allDocs.length > 1) {
        const shareUrlsPromises = allDocs.map(async (d, index) => {
          const url = await getOrFetchShareUrl(d.id);
          return { documentNumber: d.documentNumber || index + 1, url: url || "" };
        });
        const shareUrls = await Promise.all(shareUrlsPromises);
        const msg = formatWhatsAppInvoiceMessage(customerName, shareUrls);
        await navigator.clipboard.writeText(msg);
        setCopiedMsgId(requestId);
        setTimeout(() => setCopiedMsgId(null), 3000);
      } else if (documentId) {
        const shareUrl = await getOrFetchShareUrl(documentId);
        if (shareUrl) {
          const msg = formatWhatsAppInvoiceMessage(customerName, shareUrl);
          await navigator.clipboard.writeText(msg);
          setCopiedMsgId(requestId);
          setTimeout(() => setCopiedMsgId(null), 3000);
        }
      }
    } catch (err) {
      console.error("Error al copiar mensaje WhatsApp:", err);
    } finally {
      setSharingId(null);
    }
  };

  const getStatusInfo = (req: SanitizedInvoiceRequest) => {
    const activeRect = req.activeRectification;

    if (activeRect) {
      if (activeRect.status === "REQUESTED") {
        return {
          label: "Cambio solicitado",
          bg: "bg-purple-100 text-purple-800 border-purple-200",
          actionType: "RECT_PENDING",
        };
      }
      if (
        activeRect.status === "IN_PROGRESS" ||
        activeRect.status === "CREDIT_NOTE_REGISTERED" ||
        activeRect.status === "NEW_INVOICE_PENDING"
      ) {
        return {
          label: "Corrigiendo factura",
          bg: "bg-blue-100 text-blue-800 border-blue-200",
          actionType: "RECT_IN_PROGRESS",
        };
      }
      if (activeRect.status === "COMPLETED") {
        return {
          label: "Factura corregida",
          bg: "bg-emerald-100 text-emerald-800 border-emerald-200",
          actionType: "RECT_COMPLETED",
        };
      }
    }

    switch (req.status) {
      case "PENDING":
        return {
          label: "Pendiente",
          bg: "bg-amber-100 text-amber-800 border-amber-200",
          actionType: "PENDING",
        };
      case "IN_PROGRESS":
        return {
          label: "En proceso",
          bg: "bg-blue-100 text-blue-800 border-blue-200",
          actionType: "IN_PROGRESS",
        };
      case "NEEDS_CORRECTION":
        return {
          label: "Debe corregir",
          bg: "bg-rose-100 text-rose-800 border-rose-200",
          actionType: "NEEDS_CORRECTION",
        };
      case "COMPLETED": {
        const docCount = req.documents?.length || (req.document ? 1 : 0);
        return {
          label: docCount > 1 ? `Factura lista (${docCount} docs)` : "Factura lista",
          bg: "bg-emerald-100 text-emerald-800 border-emerald-200",
          actionType: "COMPLETED",
        };
      }
      default:
        return {
          label: req.status,
          bg: "bg-slate-100 text-slate-800 border-slate-200",
          actionType: "DEFAULT",
        };
    }
  };

  // Counters calculation for the requester's own requests
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const needsCorrectionCount = requests.filter(
    (r) => r.status === "NEEDS_CORRECTION" || r.activeRectification?.status === "REQUESTED"
  ).length;
  const inProgressCount = requests.filter(
    (r) =>
      r.status === "IN_PROGRESS" ||
      (r.activeRectification &&
        r.activeRectification.status !== "REQUESTED" &&
        r.activeRectification.status !== "COMPLETED")
  ).length;
  const completedCount = requests.filter(
    (r) => r.status === "COMPLETED" && (!r.activeRectification || r.activeRectification.status === "COMPLETED")
  ).length;
  const totalCount = requests.length;

  // Filter requests according to the selected summary tab
  const filteredRequests = requests.filter((req) => {
    if (selectedTab === "ALL") return true;
    if (selectedTab === "PENDING") return req.status === "PENDING";
    if (selectedTab === "NEEDS_CORRECTION") {
      return req.status === "NEEDS_CORRECTION" || req.activeRectification?.status === "REQUESTED";
    }
    if (selectedTab === "IN_PROGRESS") {
      return (
        req.status === "IN_PROGRESS" ||
        (req.activeRectification &&
          req.activeRectification.status !== "REQUESTED" &&
          req.activeRectification.status !== "COMPLETED")
      );
    }
    if (selectedTab === "COMPLETED") {
      return req.status === "COMPLETED" && (!req.activeRectification || req.activeRectification.status === "COMPLETED");
    }
    return true;
  });

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Mis Facturas y Solicitudes</h2>
          <p className="text-xs text-slate-500">
            Consulta el estado de tus solicitudes, edita las pendientes y comparte facturas listas por WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
          >
            ↻ Actualizar
          </button>
          <Link
            href="/solicitar"
            className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
          >
            + Nueva solicitud
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
          {error}
        </div>
      )}

      {/* RESUMEN OPERATIVO / TARJETAS DE ESTADO INTERACTIVAS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {/* Todas */}
        <button
          type="button"
          onClick={() => setSelectedTab("ALL")}
          className={`p-3 rounded-xl border text-left transition relative cursor-pointer ${
            selectedTab === "ALL"
              ? "bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-slate-900/20"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}
        >
          <span
            className={`text-[10px] font-bold uppercase tracking-wider block ${
              selectedTab === "ALL" ? "text-slate-300" : "text-slate-500"
            }`}
          >
            Todas
          </span>
          <span className="text-lg font-extrabold font-mono">{totalCount}</span>
        </button>

        {/* Pendientes */}
        <button
          type="button"
          onClick={() => setSelectedTab(selectedTab === "PENDING" ? "ALL" : "PENDING")}
          className={`p-3 rounded-xl border text-left transition relative cursor-pointer ${
            selectedTab === "PENDING"
              ? "bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-600/30"
              : "bg-amber-50/60 hover:bg-amber-100/70 text-amber-950 border-amber-200/80"
          }`}
        >
          <span
            className={`text-[10px] font-bold uppercase tracking-wider block ${
              selectedTab === "PENDING" ? "text-amber-100" : "text-amber-700"
            }`}
          >
            Pendientes
          </span>
          <span className="text-lg font-extrabold font-mono">{pendingCount}</span>
        </button>

        {/* Por corregir (Prioridad visual destacada) */}
        <button
          type="button"
          onClick={() =>
            setSelectedTab(selectedTab === "NEEDS_CORRECTION" ? "ALL" : "NEEDS_CORRECTION")
          }
          className={`p-3 rounded-xl border text-left transition relative cursor-pointer ${
            selectedTab === "NEEDS_CORRECTION"
              ? "bg-rose-600 text-white border-rose-600 shadow-sm ring-2 ring-rose-600/30"
              : needsCorrectionCount > 0
              ? "bg-rose-50 hover:bg-rose-100/80 text-rose-950 border-rose-300 ring-1 ring-rose-300"
              : "bg-rose-50/40 hover:bg-rose-50 text-rose-800 border-rose-200/60"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider block ${
                selectedTab === "NEEDS_CORRECTION" ? "text-rose-100" : "text-rose-700 font-extrabold"
              }`}
            >
              Por corregir
            </span>
            {needsCorrectionCount > 0 && selectedTab !== "NEEDS_CORRECTION" && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.2 bg-rose-600 text-white text-[10px] font-extrabold rounded-full animate-pulse">
                !
              </span>
            )}
          </div>
          <span className="text-lg font-extrabold font-mono">{needsCorrectionCount}</span>
        </button>

        {/* En proceso */}
        <button
          type="button"
          onClick={() => setSelectedTab(selectedTab === "IN_PROGRESS" ? "ALL" : "IN_PROGRESS")}
          className={`p-3 rounded-xl border text-left transition relative cursor-pointer ${
            selectedTab === "IN_PROGRESS"
              ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-600/30"
              : "bg-blue-50/60 hover:bg-blue-100/70 text-blue-950 border-blue-200/80"
          }`}
        >
          <span
            className={`text-[10px] font-bold uppercase tracking-wider block ${
              selectedTab === "IN_PROGRESS" ? "text-blue-100" : "text-blue-700"
            }`}
          >
            En proceso
          </span>
          <span className="text-lg font-extrabold font-mono">{inProgressCount}</span>
        </button>

        {/* Realizadas */}
        <button
          type="button"
          onClick={() => setSelectedTab(selectedTab === "COMPLETED" ? "ALL" : "COMPLETED")}
          className={`p-3 rounded-xl border text-left transition relative cursor-pointer col-span-2 sm:col-span-1 ${
            selectedTab === "COMPLETED"
              ? "bg-emerald-700 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-700/30"
              : "bg-emerald-50/60 hover:bg-emerald-100/70 text-emerald-950 border-emerald-200/80"
          }`}
        >
          <span
            className={`text-[10px] font-bold uppercase tracking-wider block ${
              selectedTab === "COMPLETED" ? "text-emerald-100" : "text-emerald-700"
            }`}
          >
            Realizadas
          </span>
          <span className="text-lg font-extrabold font-mono">{completedCount}</span>
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500">
          <div className="w-8 h-8 border-3 border-slate-300 border-t-emerald-600 rounded-full animate-spin mx-auto mb-2" />
          Cargando tus solicitudes...
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 space-y-2 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 p-6">
          <p className="font-semibold text-slate-700">
            {selectedTab === "NEEDS_CORRECTION"
              ? "✓ No tienes facturas pendientes de corrección."
              : selectedTab === "PENDING"
              ? "No tienes solicitudes pendientes de facturar."
              : selectedTab === "IN_PROGRESS"
              ? "No tienes facturas en proceso de emisión en este momento."
              : selectedTab === "COMPLETED"
              ? "No hay facturas emitidas en este filtro."
              : "Aún no has creado ninguna solicitud de factura."}
          </p>
          {selectedTab !== "ALL" ? (
            <button
              type="button"
              onClick={() => setSelectedTab("ALL")}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Ver todas las solicitudes ({totalCount}) →
            </button>
          ) : (
            <Link
              href="/solicitar"
              className="inline-block py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition"
            >
              Crear mi primera solicitud →
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-700 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Razón Social</th>
                <th className="py-3 px-4">RUT</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req) => {
                const statusInfo = getStatusInfo(req);
                const isLinkCopied = copiedLinkId === req.id;
                const isMsgCopied = copiedMsgId === req.id;
                const isSharing = sharingId === req.id;

                return (
                  <tr key={req.id} className="hover:bg-slate-50/70 transition">
                    {/* Razón Social */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 line-clamp-1">
                        {req.customerLegalNameSnapshot}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {req.requestNumber}
                      </div>
                    </td>

                    {/* RUT */}
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                      {req.customerRutSnapshot}
                    </td>

                    {/* Estado */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusInfo.bg}`}
                      >
                        {statusInfo.label}
                      </span>
                    </td>

                    {/* Acción */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Botón Datos Cliente (Para todas las solicitudes) */}
                        <button
                          type="button"
                          onClick={() => {
                            setContactModalReq(req);
                            setCopiedPhone(false);
                            setCopiedEmail(false);
                          }}
                          className="py-1.5 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 rounded-lg transition text-[11px]"
                          title="Ver datos de contacto del cliente"
                        >
                          👤 Datos cliente
                        </button>

                        {/* Acciones según Estado */}
                        {statusInfo.actionType === "PENDING" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingRequest(req)}
                              className="py-1.5 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold border border-amber-300 rounded-lg transition text-[11px] shadow-2xs"
                              title="Editar datos de la solicitud pendiente antes de que sea procesada"
                            >
                              ✏️ Editar
                            </button>
                            <Link
                              href={`/requests/${req.id}`}
                              className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition text-[11px]"
                            >
                              Ver
                            </Link>
                          </>
                        ) : statusInfo.actionType === "NEEDS_CORRECTION" ? (
                          <Link
                            href={`/requests/${req.id}/corregir`}
                            className="py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-sm transition text-[11px]"
                          >
                            Corregir
                          </Link>
                        ) : statusInfo.actionType === "COMPLETED" ? (
                          <>
                            {req.documents && req.documents.length > 1 ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setDocsModalReq(req)}
                                  className="py-1.5 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold border border-indigo-200 rounded-lg transition text-[11px] flex items-center gap-1 shadow-xs"
                                  title="Ver y descargar los documentos tributarios de esta factura"
                                >
                                  <span>📄</span>
                                  <span>{req.documents.length} facturas</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyMessage(
                                      req.id,
                                      req.customerLegalNameSnapshot,
                                      undefined,
                                      req.documents
                                    )
                                  }
                                  disabled={isSharing}
                                  className={`py-1.5 px-2.5 font-bold rounded-lg transition text-[11px] shadow-xs ${
                                    isMsgCopied
                                      ? "bg-emerald-600 text-white"
                                      : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  }`}
                                  title="Copiar mensaje consolidado para WhatsApp con todos los enlaces"
                                >
                                  {isMsgCopied ? "✓ Copiado" : isSharing ? "..." : "Copiar mensaje"}
                                </button>
                              </>
                            ) : req.document ? (
                              <>
                                <a
                                  href={`/api/v1/documents/${req.document.id}/access?stream=true`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition text-[11px]"
                                >
                                  Ver factura
                                </a>

                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(req.id, req.document?.id)}
                                  disabled={isSharing}
                                  className={`py-1.5 px-2.5 font-bold rounded-lg transition text-[11px] shadow-xs ${
                                    isLinkCopied
                                      ? "bg-emerald-600 text-white"
                                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300"
                                  }`}
                                  title="Copiar enlace directo de factura"
                                >
                                  {isLinkCopied ? "✓ Copiado" : "Copiar enlace"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyMessage(
                                      req.id,
                                      req.customerLegalNameSnapshot,
                                      req.document?.id
                                    )
                                  }
                                  disabled={isSharing}
                                  className={`py-1.5 px-2.5 font-bold rounded-lg transition text-[11px] shadow-xs ${
                                    isMsgCopied
                                      ? "bg-emerald-600 text-white"
                                      : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  }`}
                                  title="Copiar mensaje preparado para WhatsApp"
                                >
                                  {isMsgCopied ? "✓ Copiado" : isSharing ? "..." : "Copiar mensaje"}
                                </button>
                              </>
                            ) : (
                              <Link
                                href={`/requests/${req.id}`}
                                className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition text-[11px]"
                              >
                                Ver
                              </Link>
                            )}

                            <Link
                              href={`/requests/${req.id}`}
                              className="py-1.5 px-2 text-slate-500 hover:text-slate-800 font-semibold rounded-lg transition text-[11px]"
                            >
                              Solicitar cambio
                            </Link>
                          </>
                        ) : statusInfo.actionType === "RECT_PENDING" ||
                          statusInfo.actionType === "RECT_IN_PROGRESS" ? (
                          <Link
                            href={`/requests/${req.id}`}
                            className="py-1.5 px-3 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold rounded-lg transition text-[11px]"
                          >
                            Ver estado
                          </Link>
                        ) : statusInfo.actionType === "RECT_COMPLETED" ? (
                          <Link
                            href={`/requests/${req.id}`}
                            className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition text-[11px]"
                          >
                            Ver factura corregida
                          </Link>
                        ) : (
                          <Link
                            href={`/requests/${req.id}`}
                            className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition text-[11px]"
                          >
                            Ver
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Edición de Solicitud Pendiente */}
      {editingRequest && (
        <EditPendingRequestModal
          request={editingRequest}
          isOpen={!!editingRequest}
          onClose={() => setEditingRequest(null)}
          onSaved={(updated) => {
            setRequests((prev) =>
              prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
            );
            setEditingRequest(null);
          }}
        />
      )}

      {/* Modal de Documentos Tributarios Múltiples */}
      {docsModalReq && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">📄</span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Documentos Tributarios — {docsModalReq.requestNumber}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {docsModalReq.customerLegalNameSnapshot}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDocsModalReq(null)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold p-1 rounded-lg hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Total de la operación:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatCLP(docsModalReq.expectedGrossTotal)}
                </span>
              </div>

              <div className="space-y-2">
                {(docsModalReq.documents || (docsModalReq.document ? [docsModalReq.document] : [])).map(
                  (doc, idx) => {
                    const isDocLinkCopied = copiedDocLinkId === doc.id;
                    return (
                      <div
                        key={doc.id}
                        className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="h-7 w-7 bg-indigo-100 text-indigo-800 rounded-lg flex items-center justify-center font-bold text-xs shrink-0">
                            #{doc.documentNumber || idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-slate-900 block">
                              Factura Documento #{doc.documentNumber || idx + 1}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {(doc.fileSize / 1024).toFixed(1)} KB
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={`/api/v1/documents/${doc.id}/access?stream=true`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition text-[11px]"
                          >
                            Ver PDF ↗
                          </a>

                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const url = await getOrFetchShareUrl(doc.id);
                                if (url) {
                                  await navigator.clipboard.writeText(url);
                                  setCopiedDocLinkId(doc.id);
                                  setTimeout(() => setCopiedDocLinkId(null), 2500);
                                }
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className={`py-1 px-2.5 font-bold rounded-lg transition text-[11px] ${
                              isDocLinkCopied
                                ? "bg-emerald-600 text-white"
                                : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300"
                            }`}
                          >
                            {isDocLinkCopied ? "✓ Copiado" : "Copiar enlace"}
                          </button>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2 justify-between items-center">
              <button
                type="button"
                onClick={async () => {
                  if (!docsModalReq) return;
                  await handleCopyMessage(
                    docsModalReq.id,
                    docsModalReq.customerLegalNameSnapshot,
                    undefined,
                    docsModalReq.documents
                  );
                }}
                disabled={sharingId !== null}
                className="w-full sm:w-auto py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <span>💬</span>
                <span>{copiedMsgId === docsModalReq.id ? "✓ Mensaje Copiado" : "Copiar WhatsApp Consolidado"}</span>
              </button>

              <button
                type="button"
                onClick={() => setDocsModalReq(null)}
                className="w-full sm:w-auto py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Datos de Contacto del Cliente */}
      {contactModalReq && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">👤</span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Datos de Contacto del Cliente
                  </h3>
                  <p className="text-xs text-slate-500">
                    Solicitud #{contactModalReq.requestNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContactModalReq(null)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold p-1 rounded-lg hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Razón Social
                </label>
                <div className="font-bold text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {contactModalReq.customerLegalNameSnapshot || "No registrado"}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  RUT del Cliente
                </label>
                <div className="font-mono font-bold text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {contactModalReq.customerRutSnapshot || "No registrado"}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Teléfono de Contacto
                </label>
                <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span
                    className={`font-semibold ${
                      contactModalReq.customerPhoneSnapshot?.trim()
                        ? "text-slate-900 font-mono"
                        : "text-slate-400 italic"
                    }`}
                  >
                    {contactModalReq.customerPhoneSnapshot?.trim() || "No registrado"}
                  </span>
                  {contactModalReq.customerPhoneSnapshot?.trim() && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          const phone = contactModalReq.customerPhoneSnapshot?.trim() || "";
                          await navigator.clipboard.writeText(phone);
                          setCopiedPhone(true);
                          setTimeout(() => setCopiedPhone(false), 2500);
                        }}
                        className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded text-[11px] transition shadow-2xs"
                      >
                        {copiedPhone ? "✓ Copiado" : "Copiar"}
                      </button>

                      {(contactModalReq.documents && contactModalReq.documents.length > 0) || contactModalReq.document ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const rawPhone = contactModalReq.customerPhoneSnapshot?.trim() || "";
                            const cleanDigits = rawPhone.replace(/\D/g, "");
                            const fullPhone = cleanDigits.startsWith("56")
                              ? cleanDigits
                              : `56${cleanDigits.replace(/^0+/, "")}`;

                            const docs = contactModalReq.documents || (contactModalReq.document ? [contactModalReq.document] : []);
                            if (docs.length > 1) {
                              const shareUrlsPromises = docs.map(async (d, index) => {
                                const url = await getOrFetchShareUrl(d.id);
                                return { documentNumber: d.documentNumber || index + 1, url: url || "" };
                              });
                              const shareUrls = await Promise.all(shareUrlsPromises);
                              const msg = formatWhatsAppInvoiceMessage(
                                contactModalReq.customerLegalNameSnapshot,
                                shareUrls
                              );
                              window.open(
                                `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`,
                                "_blank"
                              );
                            } else if (docs.length === 1) {
                              const shareUrl = await getOrFetchShareUrl(docs[0].id);
                              if (shareUrl) {
                                const msg = formatWhatsAppInvoiceMessage(
                                  contactModalReq.customerLegalNameSnapshot,
                                  shareUrl
                                );
                                window.open(
                                  `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`,
                                  "_blank"
                                );
                              }
                            }
                          }}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11px] transition shadow-2xs"
                        >
                          💬 WhatsApp
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Correo Electrónico
                </label>
                <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span
                    className={`font-semibold ${
                      contactModalReq.customerEmailSnapshot?.trim()
                        ? "text-slate-900"
                        : "text-slate-400 italic"
                    }`}
                  >
                    {contactModalReq.customerEmailSnapshot?.trim() || "No registrado"}
                  </span>
                  {contactModalReq.customerEmailSnapshot?.trim() && (
                    <button
                      type="button"
                      onClick={async () => {
                        const email = contactModalReq.customerEmailSnapshot?.trim() || "";
                        await navigator.clipboard.writeText(email);
                        setCopiedEmail(true);
                        setTimeout(() => setCopiedEmail(false), 2500);
                      }}
                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded text-[11px] transition shadow-2xs"
                    >
                      {copiedEmail ? "✓ Copiado" : "Copiar"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setContactModalReq(null)}
                className="py-1.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition text-xs shadow-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
