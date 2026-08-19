/**
 * Capa de Autenticación y Autorización — Sistema de Gestión de Facturas Maxiofertas
 * 
 * NOTA DE ARQUITECTURA:
 * La autenticación e identidad corresponden a la Fase 2 / posterior.
 * El sistema contará con autenticación y autorización PROPIAS e independientes del Hub Maxiofertas.
 * 
 * NO TOCAR el Hub Maxiofertas ni reutilizar sesiones o tokens del Hub.
 */

export interface AuthSession {
  user?: {
    id: string;
    email: string;
    name: string;
    role: "SOLICITANTE" | "EJECUTOR" | "ADMIN";
    warehouseId?: string;
  };
}

export async function getServerSession(): Promise<AuthSession | null> {
  // Stub para Fase 1 - Retorna null
  return null;
}
