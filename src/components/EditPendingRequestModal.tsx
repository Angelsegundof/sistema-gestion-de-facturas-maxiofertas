"use client";

import React, { useState } from "react";
import { SanitizedInvoiceRequest } from "@/domain/types";
import { formatRut, normalizeRut, validateRut } from "@/lib/validation/rut";
import { calculateRequestTotals, formatCLP, RequestTotals } from "@/domain/pricing";

interface EditPendingRequestModalProps {
  request: SanitizedInvoiceRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updatedRequest: SanitizedInvoiceRequest) => void;
}

interface ItemRow {
  description: string;
  quantity: number;
  unitPriceGross: number;
}

export default function EditPendingRequestModal({
  request,
  isOpen,
  onClose,
  onSaved,
}: EditPendingRequestModalProps) {
  if (!isOpen || !request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <EditPendingRequestForm
        key={request.id}
        request={request}
        onClose={onClose}
        onSaved={onSaved}
      />
    </div>
  );
}

function EditPendingRequestForm({
  request,
  onClose,
  onSaved,
}: {
  request: SanitizedInvoiceRequest;
  onClose: () => void;
  onSaved: (updatedRequest: SanitizedInvoiceRequest) => void;
}) {
  const [rut, setRut] = useState(() => request.customerRutSnapshot || "");
  const [legalName, setLegalName] = useState(() => request.customerLegalNameSnapshot || "");
  const [businessActivity, setBusinessActivity] = useState(
    () => request.customerBusinessActivitySnapshot || ""
  );
  const [phone, setPhone] = useState(() => request.customerPhoneSnapshot || "");
  const [email, setEmail] = useState(() => request.customerEmailSnapshot || "");
  const [notes, setNotes] = useState(() => request.notes || "");
  const [items, setItems] = useState<ItemRow[]>(() => {
    if (request.items && request.items.length > 0) {
      return request.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPriceGross: it.unitPriceGross,
      }));
    }
    return [
      {
        description: "",
        quantity: 1,
        unitPriceGross: request.expectedGrossTotal || 0,
      },
    ];
  });

  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time deterministic calculation of totals
  let calculatedTotals: RequestTotals = {
    expectedGrossTotal: 0,
    expectedNetTotal: 0,
    calculatedVatTotal: 0,
    items: [],
  };

  try {
    if (items.length > 0) {
      calculatedTotals = calculateRequestTotals(items);
    }
  } catch {
    // Keep 0 defaults if invalid items
  }

  const handleRutChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatRut(raw);
    setRut(formatted);

    if (validateRut(raw)) {
      const canonical = normalizeRut(raw);
      try {
        setSearchingCustomer(true);
        const res = await fetch(`/api/v1/customers/by-rut/${canonical}`);
        const data = await res.json();
        if (data.success && data.data?.customer) {
          const c = data.data.customer;
          if (c.legalName && !legalName) setLegalName(c.legalName);
          if (c.businessActivity && !businessActivity) setBusinessActivity(c.businessActivity);
          if (c.phone && !phone) setPhone(c.phone);
          if (c.email && !email) setEmail(c.email);
        }
      } catch {
        // Silent fallback
      } finally {
        setSearchingCustomer(false);
      }
    }
  };

  const handleItemChange = (
    index: number,
    field: keyof ItemRow,
    value: string | number
  ) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unitPriceGross: 0 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validations
    if (!validateRut(rut)) {
      setError("El RUT del cliente no es válido según el algoritmo módulo 11.");
      return;
    }
    if (!legalName.trim() || legalName.trim().length < 2) {
      setError("La razón social debe tener al menos 2 caracteres.");
      return;
    }
    if (!businessActivity.trim() || businessActivity.trim().length < 2) {
      setError("El giro comercial debe tener al menos 2 caracteres.");
      return;
    }
    if (items.length === 0) {
      setError("Debe incluir al menos un producto.");
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.description.trim()) {
        setError(`El producto #${i + 1} requiere una descripción.`);
        return;
      }
      if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        setError(`La cantidad del producto #${i + 1} debe ser un entero mayor a 0.`);
        return;
      }
      if (item.unitPriceGross <= 0 || !Number.isInteger(item.unitPriceGross)) {
        setError(`El precio del producto #${i + 1} debe ser un entero mayor a $0.`);
        return;
      }
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/v1/invoice-requests/${request.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            rut: rut.trim(),
            legalName: legalName.trim(),
            businessActivity: businessActivity.trim(),
            phone: phone.trim() || null,
            email: email.trim().toLowerCase() || null,
          },
          items: items.map((it) => ({
            description: it.description.trim(),
            quantity: Math.floor(it.quantity),
            unitPriceGross: Math.floor(it.unitPriceGross),
          })),
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setError(
          data.error?.message ||
            "Esta solicitud ya comenzó a ser procesada y no puede modificarse. Actualiza la página para continuar."
        );
        return;
      }

      if (!data.success || !data.data?.request) {
        setError(data.error?.message || "Error al actualizar la solicitud.");
        return;
      }

      onSaved(data.data.request);
      onClose();
    } catch {
      setError("Error de red al actualizar la solicitud.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-5 my-8 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-lg border border-amber-200">
            ✏️
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Editar Solicitud Pendiente</h3>
            <p className="text-xs text-slate-500 font-mono">
              {request.requestNumber} • <span className="text-amber-700 font-semibold">Estado: PENDING</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 rounded-lg hover:bg-slate-100 transition"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold shrink-0">
          ⚠️ {error}
        </div>
      )}

      {/* Scrollable Form Body */}
      <form id="edit-request-form" onSubmit={handleSubmit} className="space-y-5 overflow-y-auto pr-1 text-xs">
        {/* Section 1: Customer Info */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              1. Datos Tributarios del Cliente
            </span>
            {searchingCustomer && (
              <span className="text-blue-600 text-[11px] animate-pulse">Buscando cliente...</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">RUT Empresa / Cliente *</label>
              <input
                type="text"
                value={rut}
                onChange={handleRutChange}
                placeholder="Ej: 76.123.456-7"
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Razón Social *</label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Ej: Inversiones y Servicios SpA"
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-600 font-semibold mb-1">Giro Comercial *</label>
              <input
                type="text"
                value={businessActivity}
                onChange={(e) => setBusinessActivity(e.target.value)}
                placeholder="Ej: Venta al por mayor de calzado y vestuario"
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Teléfono de Contacto</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej: +56 9 8765 4321"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ej: contacto@cliente.cl"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Products & Line Items */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              2. Detalle de Productos
            </span>
            <button
              type="button"
              onClick={handleAddItem}
              className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-lg border border-amber-300 transition text-[11px]"
            >
              + Agregar producto
            </button>
          </div>

          <div className="space-y-2.5">
            {items.map((item, index) => {
              const lineTotal = item.quantity * item.unitPriceGross;
              return (
                <div
                  key={index}
                  className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 relative group"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <span>Línea #{index + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="text-rose-500 hover:text-rose-700 font-bold transition px-1.5 py-0.5 rounded hover:bg-rose-50"
                      >
                        ✕ Eliminar
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-6">
                      <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Descripción</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                        placeholder="Descripción del producto..."
                        required
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-slate-900 focus:bg-white outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity || ""}
                        onChange={(e) =>
                          handleItemChange(index, "quantity", parseInt(e.target.value, 10) || 0)
                        }
                        required
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-slate-900 font-bold text-center focus:bg-white outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                        Precio Unit (c/IVA)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.unitPriceGross || ""}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            "unitPriceGross",
                            parseInt(e.target.value, 10) || 0
                          )
                        }
                        required
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-slate-900 font-bold text-right focus:bg-white outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2 text-right">
                      <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Total Línea</label>
                      <div className="py-1.5 font-bold font-mono text-slate-900">
                        {formatCLP(lineTotal)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Split Invoicing Informational Banner */}
          {items.length > 10 && (
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-950 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                <span>ℹ️</span>
                <span>Facturación Dividida ({Math.ceil(items.length / 10)} documentos tributarios)</span>
              </div>
              <p className="text-indigo-800 text-[11px]">
                Esta solicitud contiene <strong>{items.length} productos</strong>. Como el SII permite máximo 10 ítems por factura, se emitirá en <strong>{Math.ceil(items.length / 10)} documentos</strong> (
                {Array.from({ length: Math.ceil(items.length / 10) })
                  .map((_, i) => `Doc ${i + 1}: ${Math.min((i + 1) * 10, items.length) - i * 10} prods`)
                  .join(", ")}
                ).
              </p>
            </div>
          )}

          {/* Recalculated Summary Card */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 text-slate-700 font-semibold">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Neto Estimado:</span>
                <span className="font-mono font-bold">{formatCLP(calculatedTotals.expectedNetTotal)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">IVA (19%):</span>
                <span className="font-mono font-bold">{formatCLP(calculatedTotals.calculatedVatTotal)}</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-amber-800 block text-[10px] uppercase font-bold">Total Bruto Recalculado:</span>
              <span className="text-base font-extrabold font-mono text-amber-900">
                {formatCLP(calculatedTotals.expectedGrossTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Notes */}
        <div>
          <label className="block text-slate-600 font-semibold mb-1">Observaciones / Notas de la Solicitud</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones operativas (opcional)..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none resize-none"
          />
        </div>
      </form>

      {/* Footer Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition text-xs"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="edit-request-form"
          disabled={saving}
          className="py-2 px-5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition text-xs shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Guardando cambios...
            </>
          ) : (
            "✓ Guardar Cambios"
          )}
        </button>
      </div>
    </div>
  );
}
