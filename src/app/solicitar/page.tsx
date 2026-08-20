"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCLP } from "@/domain/pricing";
import { formatRut, normalizeRut, validateRut } from "@/lib/validation/rut";
import { SanitizedUser, SanitizedInvoiceRequest, DuplicateCandidate } from "@/domain/types";

interface ProductLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceGross: number;
}

export default function SolicitarFacturaPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Form State
  const [rut, setRut] = useState("");
  const [legalName, setLegalName] = useState("");
  const [businessActivity, setBusinessActivity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  // Customer Autocomplete feedback
  const [customerLookupStatus, setCustomerLookupStatus] = useState<"idle" | "loading" | "found" | "new">("idle");
  const [rutError, setRutError] = useState<string | null>(null);

  // Products
  const [items, setItems] = useState<ProductLine[]>([
    { id: "item-1", description: "", quantity: 1, unitPriceGross: 0 },
  ]);

  // Submission & Duplicates
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DuplicateCandidate | null>(null);
  const [confirmedRequest, setConfirmedRequest] = useState<SanitizedInvoiceRequest | null>(null);

  // Fetch logged user and session
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/v1/auth/session");
        const data = await res.json();
        if (data.success && data.data?.user) {
          setCurrentUser(data.data.user);
        } else {
          router.push("/login");
        }
      } catch {
        router.push("/login");
      } finally {
        setLoadingUser(false);
      }
    }
    loadUser();
  }, [router]);

  // RUT Blur Lookup
  const handleRutBlur = async () => {
    const trimmed = rut.trim();
    if (!trimmed) {
      setRutError(null);
      setCustomerLookupStatus("idle");
      return;
    }

    if (!validateRut(trimmed)) {
      setRutError("Revisa el RUT. Parece estar incompleto o ser inv?lido.");
      setCustomerLookupStatus("idle");
      return;
    }

    setRutError(null);
    setRut(formatRut(trimmed));
    setCustomerLookupStatus("loading");

    try {
      const canonical = normalizeRut(trimmed);
      const res = await fetch(`/api/v1/customers/by-rut/${encodeURIComponent(canonical)}`);
      const data = await res.json();

      if (data.success && data.data?.customer) {
        const c = data.data.customer;
        setLegalName(c.legalName);
        setBusinessActivity(c.businessActivity);
        setPhone(c.phone || "");
        setEmail(c.email || "");
        setCustomerLookupStatus("found");
      } else {
        setCustomerLookupStatus("new");
      }
    } catch {
      setCustomerLookupStatus("new");
    }
  };

  // Product Line Operations
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

  // Calculate Totals
  const totalFacturar = items.reduce((acc, item) => {
    const qty = Math.max(0, item.quantity || 0);
    const price = Math.max(0, item.unitPriceGross || 0);
    return acc + qty * price;
  }, 0);

  // Submit Handler
  const handleSubmit = async (override = false) => {
    setFormError(null);
    if (!validateRut(rut)) {
      setRutError("Ingresa un RUT v?lido para continuar.");
      return;
    }
    if (!legalName.trim()) {
      setFormError("La raz?n social del cliente es obligatoria.");
      return;
    }
    if (!businessActivity.trim()) {
      setFormError("El giro comercial del cliente es obligatorio.");
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
        duplicateOverride: override,
      };

      const res = await fetch("/api/v1/invoice-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.status === 409 && data.error?.code === "POSSIBLE_DUPLICATE") {
        setDuplicateCandidate(data.error.details?.candidate);
        setSubmitting(false);
        return;
      }

      if (data.success && data.data?.request) {
        setConfirmedRequest(data.data.request);
        setDuplicateCandidate(null);
      } else {
        setFormError(data.error?.message || "Ocurri? un error al enviar la solicitud.");
      }
    } catch {
      setFormError("Error de conexi?n con el servidor. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-600">Cargando...</p>
      </div>
    );
  }

  // View: Success Confirmation Screen
  if (confirmedRequest) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full mb-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Solicitud enviada</h1>
            <p className="text-sm text-slate-600 mt-1">La solicitud qued? pendiente de facturaci?n.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-5 border border-slate-200 space-y-3 mb-6">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">N?mero de solicitud:</span>
              <span className="font-mono font-bold text-slate-900 text-base">{confirmedRequest.requestNumber}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Cliente:</span>
              <span className="font-medium text-slate-900 text-right">{confirmedRequest.customerLegalNameSnapshot}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Total a facturar:</span>
              <span className="font-bold text-emerald-700 text-lg">{formatCLP(confirmedRequest.expectedGrossTotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
              <span className="text-slate-500">Estado:</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                Pendiente
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/requests/${confirmedRequest.id}`}
              className="flex-1 text-center py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-sm transition"
            >
              Ver solicitud
            </Link>
            <button
              onClick={() => {
                setConfirmedRequest(null);
                setRut("");
                setLegalName("");
                setBusinessActivity("");
                setPhone("");
                setEmail("");
                setNotes("");
                setItems([{ id: "item-1", description: "", quantity: 1, unitPriceGross: 0 }]);
                setCustomerLookupStatus("idle");
              }}
              className="flex-1 text-center py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-sm font-semibold rounded-lg shadow-sm transition"
            >
              Solicitar otra factura
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header & Navigation */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-1">
              ? Volver al inicio
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Solicitar factura</h1>
          </div>
          <div className="text-right">
            <span className="inline-block px-2.5 py-1 bg-slate-200 text-slate-800 text-xs font-semibold rounded-md">
              {currentUser?.warehouse?.name ? `Bodega ${currentUser.warehouse.name}` : "Bodega Central"}
            </span>
            <p className="text-xs text-slate-500 mt-1">{currentUser?.name}</p>
          </div>
        </div>

        {/* Possible Duplicate Warning Modal / Banner */}
        {duplicateCandidate && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="text-amber-600 mt-0.5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-amber-900">Esta solicitud se parece a otra reciente</h3>
                <p className="text-xs text-amber-800 mt-1">
                  Encontramos una solicitud previa con el mismo RUT, total y bodega en las ?ltimas 24 horas:
                </p>

                <div className="bg-white rounded-lg p-3 border border-amber-200 mt-2 space-y-1 text-xs">
                  <p>
                    <strong className="text-slate-700">N?mero:</strong> {duplicateCandidate.requestNumber}
                  </p>
                  <p>
                    <strong className="text-slate-700">Cliente:</strong> {duplicateCandidate.customerLegalName}
                  </p>
                  <p>
                    <strong className="text-slate-700">Total:</strong> {formatCLP(duplicateCandidate.grossTotal)}
                  </p>
                  <p>
                    <strong className="text-slate-700">Estado:</strong> {duplicateCandidate.status}
                  </p>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => handleSubmit(true)}
                    disabled={submitting}
                    className="py-1.5 px-3 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-md shadow-sm transition"
                  >
                    {submitting ? "Enviando..." : "Enviar de todas maneras"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateCandidate(null)}
                    className="py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-md shadow-sm transition"
                  >
                    No enviar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(false);
          }}
          className="space-y-6"
        >
          {/* Bloque 1: Datos del cliente */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
              1. Datos del cliente
            </h2>

            <div className="space-y-4">
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
                  placeholder="Ej: 76.123.456-7"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
                {rutError && <p className="text-xs text-rose-600 mt-1">{rutError}</p>}

                {customerLookupStatus === "loading" && (
                  <p className="text-xs text-slate-500 mt-1">Buscando datos del cliente...</p>
                )}

                {customerLookupStatus === "found" && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-md p-2.5 mt-2 flex items-center justify-between text-xs text-emerald-800">
                    <span>? Encontramos este cliente. Datos autocompletados.</span>
                  </div>
                )}

                {customerLookupStatus === "new" && (
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2 mt-2">
                    ? Cliente nuevo. Completa sus datos para continuar.
                  </p>
                )}
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
                  placeholder="Nombre legal o empresa"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                  placeholder="Ej: Venta al por menor, Construcci?n..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                    placeholder="+56 9 1234 5678"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                    placeholder="contacto@empresa.cl"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bloque 2: Productos */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">2. Productos</h2>
              <span className="text-xs text-slate-500">Precios IVA incluido</span>
            </div>

            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 mb-4 text-xs">
              <strong>Ayuda de precio:</strong> Ingresa el precio final que pag? el cliente. El valor ya debe incluir IVA.
            </div>

            <div className="space-y-4">
              {items.map((item, index) => {
                const lineTotal = (item.quantity || 0) * (item.unitPriceGross || 0);
                return (
                  <div
                    key={item.id}
                    className="p-4 bg-slate-50 rounded-lg border border-slate-200 relative space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-600">Producto #{index + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(item.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                        >
                          ? Eliminar producto
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Descripci?n del producto *</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                        placeholder="Ej: Toldo 3x3 estructura reforzada"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Precio por unidad (IVA incl.) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                          <input
                            type="number"
                            min="1"
                            value={item.unitPriceGross || ""}
                            onChange={(e) =>
                              handleItemChange(item.id, "unitPriceGross", parseInt(e.target.value, 10) || 0)
                            }
                            placeholder="28000"
                            className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
              className="mt-4 w-full py-2 border-2 border-dashed border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-semibold rounded-lg transition"
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
                placeholder="Indica informaci?n adicional sobre la entrega o requerimientos especiales..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <span className="text-xs text-slate-400 float-right">{notes.length}/2000</span>
            </div>
          </div>

          {formError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3 text-sm">
              {formError}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base rounded-xl shadow-md transition disabled:opacity-50"
          >
            {submitting ? "Enviando solicitud..." : "Enviar solicitud"}
          </button>
        </form>
      </div>
    </div>
  );
}
