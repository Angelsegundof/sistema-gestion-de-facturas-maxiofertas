"use client";

import React, { useState, useEffect, useRef } from "react";
import { SanitizedWarehouse } from "@/domain/types";

interface WarehouseMultiSelectProps {
  warehouses: SanitizedWarehouse[];
  selectedIds: string[];
  onChange: (newSelectedIds: string[]) => void;
  className?: string;
}

export function WarehouseMultiSelect({
  warehouses,
  selectedIds,
  onChange,
  className = "",
}: WarehouseMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const activeWarehouses = warehouses.filter((w) => w.active);
  const filteredWarehouses = activeWarehouses.filter((w) =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isAllSelected =
    selectedIds.length === 0 || selectedIds.length === activeWarehouses.length;

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((item) => item !== id);
      onChange(next);
    } else {
      const next = [...selectedIds, id];
      onChange(next);
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  const handleClear = () => {
    onChange([]);
  };

  const getButtonLabel = () => {
    if (selectedIds.length === 0 || selectedIds.length === activeWarehouses.length) {
      return `Bodegas: Todas (${activeWarehouses.length})`;
    }
    if (selectedIds.length === 1) {
      const single = activeWarehouses.find((w) => w.id === selectedIds[0]);
      return `Bodega: ${single ? single.name : "1 seleccionada"}`;
    }
    return `Bodegas (${selectedIds.length} seleccionadas)`;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full sm:w-auto px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-between gap-2 cursor-pointer shadow-xs ${
          selectedIds.length > 0 && selectedIds.length < activeWarehouses.length
            ? "bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-300 ring-1 ring-blue-400/30"
            : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300"
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1.5 truncate">
          <span>🏪</span>
          <span className="truncate">{getButtonLabel()}</span>
        </span>

        <span className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
          {selectedIds.length > 0 && selectedIds.length < activeWarehouses.length && (
            <span className="bg-blue-600 text-white font-black px-1.5 py-0.2 rounded-full text-[10px]">
              {selectedIds.length}
            </span>
          )}
          <span className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            ▼
          </span>
        </span>
      </button>

      {/* Popover / Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100">
          {/* Header with Quick Actions */}
          <div className="p-2.5 bg-slate-50 border-b border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                Filtro de Bodegas
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {selectedIds.length === 0 ? "Todas seleccionadas" : `${selectedIds.length} de ${activeWarehouses.length}`}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar bodega..."
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
                autoFocus
              />
              <span className="absolute left-2 top-1.5 text-slate-400 text-xs">🔍</span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleSelectAll}
                className={`flex-1 py-1 px-2 rounded-md font-bold text-[11px] transition text-center ${
                  isAllSelected
                    ? "bg-blue-100 text-blue-800"
                    : "bg-white hover:bg-slate-200 text-slate-700 border border-slate-200"
                }`}
              >
                ☑ Seleccionar todas
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="py-1 px-2.5 bg-white hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-md font-bold text-[11px] transition text-center"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* List of Warehouses with Checkboxes */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 overscroll-contain">
            {filteredWarehouses.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs font-medium">
                No se encontraron bodegas que coincidan con &ldquo;{searchTerm}&rdquo;.
              </div>
            ) : (
              filteredWarehouses.map((wh) => {
                const checked =
                  selectedIds.length === 0 || selectedIds.includes(wh.id);

                return (
                  <label
                    key={wh.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer select-none transition-colors ${
                      checked
                        ? "bg-blue-50/50 hover:bg-blue-50 text-slate-900"
                        : "hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(wh.id)}
                        onChange={() => handleToggle(wh.id)}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="font-semibold truncate text-xs">{wh.name}</span>
                    </div>

                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                      {wh.code}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              {selectedIds.length > 0
                ? `${selectedIds.length} seleccionada${selectedIds.length > 1 ? "s" : ""}`
                : "Mostrando todas"}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="py-1 px-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs transition shadow-xs"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
