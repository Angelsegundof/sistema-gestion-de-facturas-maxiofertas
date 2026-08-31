"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SanitizedUser, Role } from "@/types";

interface Warehouse {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  MANAGEMENT: "Gerencia / Finanzas",
  INVOICE_EXECUTOR: "Ejecutor de Facturación",
  WAREHOUSE_USER: "Personal de Bodega",
};

const ROLE_BADGE_STYLES: Record<Role, string> = {
  ADMIN: "bg-red-50 text-red-700 border-red-200",
  MANAGEMENT: "bg-purple-50 text-purple-700 border-purple-200",
  INVOICE_EXECUTOR: "bg-blue-50 text-blue-700 border-blue-200",
  WAREHOUSE_USER: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<SanitizedUser[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SanitizedUser | null>(null);
  const [resettingUser, setResettingUser] = useState<SanitizedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<SanitizedUser | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<Role>("WAREHOUSE_USER");
  const [formWarehouseId, setFormWarehouseId] = useState<string>("");
  const [formPassword, setFormPassword] = useState("Maxiofertas2026!");
  const [newCustomPassword, setNewCustomPassword] = useState("Maxiofertas2026!");

  const reloadUsers = async () => {
    try {
      const usersRes = await fetch("/api/v1/admin/users");
      const usersData = await usersRes.json();
      if (usersData.success && usersData.data?.users) {
        setUsers(usersData.data.users);
      }
    } catch {
      setMessage({ type: "error", text: "Error al refrescar la lista de usuarios." });
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const [sessionRes, usersRes, whRes] = await Promise.all([
          fetch("/api/v1/auth/session"),
          fetch("/api/v1/admin/users"),
          fetch("/api/v1/warehouses"),
        ]);

        const sessionData = await sessionRes.json();
        if (!sessionData.success || sessionData.data?.user?.role !== "ADMIN") {
          router.push("/gestion");
          return;
        }

        const usersData = await usersRes.json();
        const whData = await whRes.json();

        if (isMounted) {
          setCurrentUser(sessionData.data.user);
          if (usersData.success && usersData.data?.users) {
            setUsers(usersData.data.users);
          }
          if (whData.success && whData.data?.warehouses) {
            setWarehouses(whData.data.warehouses);
          }
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setMessage({ type: "error", text: "Error al cargar datos del panel de administración." });
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          role: formRole,
          warehouseId: formRole === "WAREHOUSE_USER" && formWarehouseId ? formWarehouseId : null,
          password: formPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: "error", text: data.error?.message || "Error al crear usuario." });
        return;
      }

      setMessage({ type: "success", text: `Usuario ${formEmail} creado exitosamente.` });
      setShowCreateModal(false);
      setFormName("");
      setFormEmail("");
      setFormRole("WAREHOUSE_USER");
      setFormWarehouseId("");
      setFormPassword("Maxiofertas2026!");
      reloadUsers();
    } catch {
      setMessage({ type: "error", text: "Error de conexión al crear usuario." });
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setMessage(null);

    try {
      const res = await fetch(`/api/v1/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          role: formRole,
          warehouseId: formRole === "WAREHOUSE_USER" && formWarehouseId ? formWarehouseId : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: "error", text: data.error?.message || "Error al actualizar usuario." });
        return;
      }

      setMessage({ type: "success", text: `Usuario ${editingUser.email} modificado correctamente.` });
      setEditingUser(null);
      reloadUsers();
    } catch {
      setMessage({ type: "error", text: "Error de conexión al actualizar usuario." });
    }
  };

  const handleToggleActive = async (user: SanitizedUser) => {
    if (user.id === currentUser?.id) {
      alert("No puedes desactivar tu propia cuenta administradora activa.");
      return;
    }

    try {
      const res = await fetch(`/api/v1/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: `Usuario ${user.email} ${!user.active ? "activado" : "desactivado"} exitosamente.`,
        });
        reloadUsers();
      }
    } catch {
      setMessage({ type: "error", text: "Error al cambiar estado del usuario." });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;

    try {
      const res = await fetch(`/api/v1/admin/users/${resettingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newCustomPassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: "error", text: data.error?.message || "Error al reiniciar contraseña." });
        return;
      }

      setMessage({
        type: "success",
        text: `Contraseña de ${resettingUser.email} restablecida exitosamente.`,
      });
      setResettingUser(null);
      setNewCustomPassword("Maxiofertas2026!");
    } catch {
      setMessage({ type: "error", text: "Error al reiniciar contraseña." });
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    try {
      const res = await fetch(`/api/v1/admin/users/${deletingUser.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: "error", text: data.error?.message || "Error al eliminar usuario." });
        return;
      }

      setMessage({ type: "success", text: `Usuario ${deletingUser.email} eliminado exitosamente.` });
      setDeletingUser(null);
      reloadUsers();
    } catch {
      setMessage({ type: "error", text: "Error al eliminar usuario." });
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getWarehouseName = (wId: string | null) => {
    if (!wId) return "—";
    const found = warehouses.find((w) => w.id === wId);
    return found ? found.name : "Bodega asignada";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Cargando panel de usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3.5">
            <img
              src="/icon.png"
              alt="Maxiofertas"
              className="w-12 h-12 object-contain rounded-xl border border-slate-100 p-0.5 bg-white shadow-xs shrink-0"
            />
            <div>
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider">
                Panel de Control Administrador
              </span>
              <h1 className="text-2xl font-black text-slate-900">Gestión de Usuarios y Roles</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Sesión: <span className="font-semibold text-slate-700">{currentUser?.name}</span> ({currentUser?.email})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/gestion"
              className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
            >
              <span>← Mesa de Facturación</span>
            </Link>
            <button
              onClick={() => {
                setFormName("");
                setFormEmail("");
                setFormRole("WAREHOUSE_USER");
                setFormWarehouseId("");
                setFormPassword("Maxiofertas2026!");
                setShowCreateModal(true);
              }}
              className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md transition flex items-center gap-2"
            >
              <span>+</span>
              <span>Nuevo Usuario</span>
            </button>
          </div>
        </header>

        {/* Notifications */}
        {message && (
          <div
            className={`p-4 rounded-xl text-sm font-semibold border flex items-center justify-between ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-xs font-bold hover:underline">
              Cerrar
            </button>
          </div>
        )}

        {/* Filters and Stats */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Buscar por nombre o correo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-3 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="py-2 px-3 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            >
              <option value="ALL">Todos los Roles ({users.length})</option>
              <option value="ADMIN">Administradores</option>
              <option value="MANAGEMENT">Gerencia / Finanzas</option>
              <option value="INVOICE_EXECUTOR">Ejecutores de Facturación</option>
              <option value="WAREHOUSE_USER">Personal de Bodega</option>
            </select>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
            <span>Total: <strong className="text-slate-900">{users.length}</strong></span>
            <span>Activos: <strong className="text-emerald-600">{users.filter((u) => u.active).length}</strong></span>
            <span>Inactivos: <strong className="text-red-500">{users.filter((u) => !u.active).length}</strong></span>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Usuario</th>
                  <th className="py-3.5 px-4">Rol</th>
                  <th className="py-3.5 px-4">Bodega Asignada</th>
                  <th className="py-3.5 px-4">Estado</th>
                  <th className="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                      No se encontraron usuarios que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-slate-500 font-mono text-[11px]">{u.email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${ROLE_BADGE_STYLES[u.role]}`}
                        >
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        {getWarehouseName(u.warehouseId)}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold cursor-pointer transition ${
                            u.active
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              : "bg-red-100 text-red-800 hover:bg-red-200"
                          }`}
                          title="Haz clic para activar o desactivar"
                        >
                          {u.active ? "● ACTIVO" : "○ INACTIVO"}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingUser(u);
                              setFormName(u.name);
                              setFormRole(u.role);
                              setFormWarehouseId(u.warehouseId || "");
                            }}
                            className="py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition"
                            title="Modificar datos o rol"
                          >
                            ✏️ Modificar
                          </button>
                          <button
                            onClick={() => {
                              setResettingUser(u);
                              setNewCustomPassword("Maxiofertas2026!");
                            }}
                            className="py-1 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-lg transition"
                            title="Reiniciar clave de acceso"
                          >
                            🔑 Clave
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              onClick={() => setDeletingUser(u)}
                              className="py-1 px-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold rounded-lg transition"
                              title="Eliminar usuario"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Crear Usuario */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 w-full max-w-md space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-lg text-slate-900">Registrar Nuevo Usuario</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej. Bodega Osorno / Juan Pérez"
                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="ejemplo@maxiofertas.cl"
                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rol de Acceso</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as Role)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="WAREHOUSE_USER">Personal de Bodega (Solicitante)</option>
                    <option value="INVOICE_EXECUTOR">Ejecutor de Facturación (Mesa Operativa)</option>
                    <option value="MANAGEMENT">Gerencia / Finanzas (Estadísticas)</option>
                    <option value="ADMIN">Administrador (Acceso Total)</option>
                  </select>
                </div>

                {formRole === "WAREHOUSE_USER" && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Bodega Asignada</label>
                    <select
                      value={formWarehouseId}
                      onChange={(e) => setFormWarehouseId(e.target.value)}
                      required
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Selecciona una bodega --</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contraseña Inicial</label>
                  <input
                    type="text"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Por defecto: Maxiofertas2026!</p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md"
                  >
                    Guardar Usuario
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Modificar Usuario */}
        {editingUser && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 w-full max-w-md space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Modificar Usuario</h3>
                  <p className="text-xs text-slate-500 font-mono">{editingUser.email}</p>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateUser} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rol de Acceso</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as Role)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                  >
                    <option value="WAREHOUSE_USER">Personal de Bodega (Solicitante)</option>
                    <option value="INVOICE_EXECUTOR">Ejecutor de Facturación (Mesa Operativa)</option>
                    <option value="MANAGEMENT">Gerencia / Finanzas (Estadísticas)</option>
                    <option value="ADMIN">Administrador (Acceso Total)</option>
                  </select>
                </div>

                {formRole === "WAREHOUSE_USER" && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Bodega Asignada</label>
                    <select
                      value={formWarehouseId}
                      onChange={(e) => setFormWarehouseId(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                    >
                      <option value="">-- Sin bodega asignada --</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md"
                  >
                    Actualizar Datos
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Reiniciar Clave */}
        {resettingUser && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 w-full max-w-md space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Reiniciar Contraseña</h3>
                  <p className="text-xs text-slate-500 font-mono">{resettingUser.email}</p>
                </div>
                <button
                  onClick={() => setResettingUser(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nueva Contraseña</label>
                  <input
                    type="text"
                    required
                    value={newCustomPassword}
                    onChange={(e) => setNewCustomPassword(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setNewCustomPassword("Maxiofertas2026!")}
                      className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[11px]"
                    >
                      Restablecer a: Maxiofertas2026!
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setResettingUser(null)}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md"
                  >
                    Guardar Nueva Clave
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Confirmar Eliminación */}
        {deletingUser && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 w-full max-w-md space-y-4">
              <h3 className="font-bold text-lg text-red-600">¿Eliminar Usuario?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas eliminar la cuenta de{" "}
                <strong className="text-slate-900">{deletingUser.name}</strong> (
                <span className="font-mono">{deletingUser.email}</span>)?
              </p>
              <p className="text-[11px] text-slate-400">
                Se revocarán todas sus sesiones activas de inmediato.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeletingUser(null)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteUser}
                  className="py-2 px-5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md text-xs"
                >
                  Confirmar Eliminación
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
