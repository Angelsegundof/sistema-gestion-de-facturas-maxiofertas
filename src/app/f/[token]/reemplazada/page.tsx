"use client";

import React from "react";

export default function FacturaReemplazadaPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-slate-800">
      <div className="max-w-md w-full bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-2xl mx-auto shadow-sm">
          ⚠
        </div>
        <div>
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block">
            Documento Tributario Anulado
          </span>
          <h1 className="text-xl font-black text-slate-900 mt-1">Esta factura fue reemplazada</h1>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Esta factura fue anulada mediante una Nota de Crédito debido a una rectificación de datos o montos.
          Para obtener la versión oficial y vigente de tu factura, solicita el enlace actualizado a tu ejecutivo comercial.
        </p>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 text-left space-y-1">
          <p className="font-semibold text-slate-900">¿Qué significa esto?</p>
          <ul className="list-disc pl-4 space-y-0.5 text-slate-600 text-[11px]">
            <li>El documento anterior carece de validez fiscal activa.</li>
            <li>Existe una Nota de Crédito registrada en el SII.</li>
            <li>Una nueva factura de reemplazo fue emitida para esta operación.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
