export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-xl p-8 bg-white rounded-xl shadow-sm border border-slate-200 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-blue-50 text-blue-600 font-bold text-2xl">
          M
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Sistema de Gestión de Facturas Maxiofertas
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Infraestructura Base inicializada — Fase 1 completada.
        </p>
        <div className="p-4 bg-slate-50 rounded-lg text-left text-xs font-mono text-slate-700 border border-slate-200">
          <p className="font-semibold text-slate-800 mb-1">Estado de Arquitectura:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Aplicación: Next.js App Router (TypeScript)</li>
            <li>Base de datos: PostgreSQL / Neon (Drizzle ORM)</li>
            <li>Almacenamiento: Cloudflare R2 (S3 API Client)</li>
            <li>Aislamiento: Repositorio y despliegue 100% independiente del Hub</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
