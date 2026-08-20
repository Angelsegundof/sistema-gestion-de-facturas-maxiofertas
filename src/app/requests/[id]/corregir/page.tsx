"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatCLP } from "@/domain/pricing";
import { formatRut, normalizeRut, validateRut } from "@/lib/validation/rut";
import { SanitizedInvoiceRequest } from "@/domain/types";

interface ProductLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceGross: number;
}

export default function CorregirSolicitudPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [requestData, setRequestData] = useState<SanitizedInvoiceRequest | null>(null);

  // Form State
  const [rut, setRut] = useState("");
  const [legalName, setLegalName] = useState("");
  const [businessActivity, setBusinessActivity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ProductLine[]>([]);

  const [rutError, setRutError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadRequest() {
      if (!requestId) return;
      try {
        const res = await fetch(`/api/v1/invoice-requests/${requestId}`);
        const data = await res.json();

        if (data.success && data.data?.request) {
          const req: SanitizedInvoiceRequest = data.data.request;
          if (req.status !== "NEEDS_CORRECTION") {
            router.push(`/requests/${requestId}`);
            return;
          }
          setRequestData(req);
          setRut(req.customerRutSnapshot);
          setLegalName(req.customerLegalNameSnapshot);
          setBusinessActivity(req.customerBusinessActivitySnapshot);
          setPhone(req.customerPhoneSnapshot || "");
          setEmail(req.customerEmailSnapshot || "");
          setNotes(req.notes || "");

          if (req.items && req.items.length > 0) {
            setItems(
              req.items.map((i) => ({
                id: i.id,
                description: i.description,
                quantity: i.quantity,
                unitPriceGross: i.unitPriceGross,
              }))
            );
          } else {
            setItems([{ id: "item-1", description: "", quantity: 1, unitPriceGross: 0 }]);
          }
        } else {
          setFormError(data.error?.message || "No se pudo cargar la solicitud.");
        }
      } catch {
        setFormError("Error al cargar los datos de la solicitud.");
      } finally {
        setLoading(false);
      }
    }
    loadRequest();
  }, [requestId, router]);

  const handleRutBlur = () => {
    const trimmed = rut.trim();
    if (!trimmed) return;
    if (!validateRut(trimmed)) {
      setRutError("Revisa el RUT. Parece estar incompleto o ser inv?lido.");
      return;
    }
    setRutError(null);
    setRut(formatRut(trimmed));
  };

  const handleItemChange = (id: string, field: keyof ProductLine, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const addLine = () => {
    setItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}`, description: "", quantity: 1, unitPriceGross: 0 },
    ]);
  };

  const removeLine = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totalFacturar = items.reduce((acc, item) => {
    const qty = Math.max(0, item.quantity || 0);
    const price = Math.max(0, item.unitPriceGross || 0);
    return acc + qty * price;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!validateRut(rut)) {
      setRutError("Ingresa un RUT v?lido para continuar.");
      return;
    }
    if (!legalName.trim()) {
      setFormError("La raz?n social es obligatoria.");
      return;
    }
    if (!businessActivity.trim()) {
      setFormError("El giro es obligatorio.");
      return;
    }
    if (items.some((i) => !i.description.trim() || i.quantity <= 0 || i.unitPriceGross <= 0)) {
      setFormError("Todos los productos deben tener descripci?n, cantidad (>0) y precio (>0).");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customer: {
          rut: rut.trim(),
          legalName: legalName.trim(),
          businessActivity: businessActivity.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
        },
        items: items.map((i) => ({
          description: i.description.trim(),
          quantity: Number(i.quantity),
          unitPriceGross: Number(i.unitPriceGross),
        })),
        notes: notes.trim() || null,
      };

      const res = await fetch(`/api/v1/invoice-requests/${requestId}/correction`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        router.push(`/requests/${requestId}`);
      } else {
        setFormError(data.error?.message || "Ocurri? un error al guardar la correcci?n.");
      }
    } catch {
      setFormError("Error de conexi?n al enviar la correcci?n.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-600">Cargando datos para corregir...</p>
      </div>
    );
  }

  const latestCorrection = requestData?.corrections?.[0];

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link href={`/requests/${requestId}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-1">
            ? Volver a la solicitud
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Corregir solicitud</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{requestData?.requestNumber}</p>
        </div>

        {/* Observation Warning Box */}
        {latestCorrection && (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-rose-800 text-xs font-bold uppercase tracking-wider">
              <span>?</span>
              <span>Esta solicitud necesita una correcci?n</span>
            </div>
            <div className="text-xs text-slate-800">
              <strong className="text-slate-900">Motivo:</strong> {latestCorrection.reason}
            </div>
            {latestCorrection.comment && (
              <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-rose-200">
                {latestCorrection.comment}
              </div>
            )}
          </div>
        )}

        {/* Main Correction Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bloque 1: Datos del cliente */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
              1. Datos del cliente
            </h2>

            <div>
              <label htmlFor="rut" className="block text-xs font-semibold text-slate-700 mb-1">
                RUT del cliente *
              </label>
              <input
                id="rut"
                type="text"
                value={rut}
                onChange={(e) => {
                  setRut(e.target.value);
                  if (rutError) setRutError(null);
                }}
                onBlur={handleRutBlur}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              {rutError && <p className="text-xs text-rose-600 mt-1">{rutError}</p>}
            </div>

            <div>
              <label htmlFor="legalName" className="block text-xs font-semibold text-slate-700 mb-1">
                Raz?n social *
              </label>
              <input
                id="legalName"
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label htmlFor="businessActivity" className="block text-xs font-semibold text-slate-700 mb-1">
                Giro comercial *
              </label>
              <input
                id="businessActivity"
                type="text"
                value={businessActivity}
                onChange={(e) => setBusinessActivity(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 mb-1">
                  Tel?fono (opcional)
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">
                  Correo electr?nico (opcional)
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Bloque 2: Productos */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">2. Productos</h2>
              <span className="text-xs text-slate-500">Precios IVA incluido</span>
            </div>

            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-xs">
              <strong>Ayuda de precio:</strong> Ingresa el precio final que pag? el cliente. El valor ya debe incluir IVA.
            </div>

            <div className="space-y-4">
              {items.map((item, index) => {
                const lineTotal = (item.quantity || 0) * (item.unitPriceGross || 0);
                return (
                  <div key={item.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-600">Producto #{index + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(item.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                        >
                          ? Eliminar
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Descripci?n *</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Cantidad *</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity || ""}
                          onChange={(e) => handleItemChange(item.id, "quantity", parseInt(e.target.value, 10) || 0)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Precio por unidad (IVA incl.) *</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                          <input
                            type="number"
                            min="1"
                            value={item.unitPriceGross || ""}
                            onChange={(e) =>
                              handleItemChange(item.id, "unitPriceGross", parseInt(e.target.value, 10) || 0)
                            }
                            className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Total producto</label>
                        <div className="py-2 px-3 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-900">
                          {formatCLP(lineTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addLine}
              className="w-full py-2 border-2 border-dashed border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-semibold rounded-lg transition"
            >
              + Agregar otro producto
            </button>
          </div>

          {/* Bloque 3: Total y Observaciones */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6 space-y-4">
            <div className="bg-slate-900 text-white rounded-xl p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">TOTAL A FACTURAR</p>
              <p className="text-3xl font-extrabold text-emerald-400 my-1">{formatCLP(totalFacturar)}</p>
              <p className="text-xs text-slate-400">Todos los precios incluyen IVA.</p>
            </div>

            <div>
              <label htmlFor="notes" className="block text-xs font-semibold text-slate-700 mb-1">
                Observaciones (opcional)
              </label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {formError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3 text-sm">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base rounded-xl shadow-md transition disabled:opacity-50"
          >
            {submitting ? "Guardando y reenviando..." : "Guardar y reenviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
