"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatCLP } from "@/domain/pricing";
import { SanitizedInvoiceRequest } from "@/domain/types";

export default function ViewInvoiceRequestPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.id as string;

  const [requestData, setRequestData] = useState<SanitizedInvoiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRequest() {
      if (!requestId) return;
      try {
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
    loadRequest();
  }, [requestId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-600">Cargando solicitud...</p>
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

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            ? Volver al inicio
          </Link>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            {requestData.status === "PENDING" ? "Pendiente de facturaci?n" : requestData.status}
          </span>
        </div>

        {/* Card Principal */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">N?mero de Solicitud</p>
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
                <span className="text-slate-500 block">Raz?n Social:</span>
                <span className="font-semibold text-slate-900">{requestData.customerLegalNameSnapshot}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Giro:</span>
                <span className="font-semibold text-slate-900">{requestData.customerBusinessActivitySnapshot}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Contacto:</span>
                <span className="font-semibold text-slate-900">
                  {requestData.customerPhoneSnapshot || "Sin tel?fono"} / {requestData.customerEmailSnapshot || "Sin correo"}
                </span>
              </div>
            </div>
          </div>

          {/* L?neas de Productos */}
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
    </div>
  );
}
