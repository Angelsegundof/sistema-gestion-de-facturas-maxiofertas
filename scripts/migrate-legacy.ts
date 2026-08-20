import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { runDryRun, executeLoad } from "../src/lib/migration/importer";
import { formatCLP } from "../src/domain/pricing";

async function main() {
  const args = process.argv.slice(2);
  let filePath = "data/legacy-export-sample.csv";
  let isExecute = false;

  for (const arg of args) {
    if (arg.startsWith("--file=")) {
      filePath = arg.replace("--file=", "").trim();
    } else if (arg === "--execute") {
      isExecute = true;
    } else if (arg === "--dry-run") {
      isExecute = false;
    }
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`[ERROR] Archivo fuente no encontrado en: ${resolvedPath}`);
    process.exit(1);
  }

  console.log("===============================================================");
  console.log("    SISTEMA DE GESTIÓN DE FACTURAS MAXIOFERTAS — ETL LEGACY    ");
  console.log("===============================================================");
  console.log(`Archivo fuente: ${resolvedPath}`);
  console.log(`Modo: ${isExecute ? "EXECUTE (CARGA REAL EN POSTGRESQL)" : "DRY-RUN (SIMULACIÓN / SÓLO LECTURA)"}`);
  console.log("---------------------------------------------------------------");

  const csvContent = fs.readFileSync(resolvedPath, "utf8");

  if (!isExecute) {
    console.log("Ejecutando validación y análisis Dry-Run...\n");
    const report = await runDryRun(csvContent);

    console.log("===============================================================");
    console.log("                  INFORME DE MIGRACIÓN (DRY-RUN)               ");
    console.log("===============================================================");
    console.log(`Total filas leídas:        ${report.totalRowsRead}`);
    console.log(`Filas VÁLIDAS:             ${report.validRows}`);
    console.log(`Filas con ADVERTENCIAS:    ${report.warningRows}`);
    console.log(`Filas con ERRORES:         ${report.errorRows}`);
    console.log(`Filas DUPLICADAS:          ${report.duplicateRows}`);
    console.log(`Filas OMITIDAS:            ${report.skippedRows}`);
    console.log(`Clientes únicos detectados:${report.customersDetected}`);
    console.log(`Monto bruto total:         ${formatCLP(report.totalGrossAmount)}`);
    console.log("---------------------------------------------------------------");

    console.log("\n[RESUMEN POR BODEGA]:");
    for (const [code, info] of Object.entries(report.warehousesSummary)) {
      console.log(`  - ${code.padEnd(12)}: ${String(info.count).padStart(4)} facturas | ${formatCLP(info.grossTotal)}`);
    }

    console.log("\n[RESUMEN POR ESTADO]:");
    for (const [st, count] of Object.entries(report.statusesSummary)) {
      console.log(`  - ${st.padEnd(18)}: ${count} solicitudes`);
    }

    if (Object.keys(report.errorsByType).length > 0) {
      console.log("\n[ERRORES POR TIPO]:");
      for (const [type, count] of Object.entries(report.errorsByType)) {
        console.log(`  - ${type}: ${count}`);
      }
    }

    if (Object.keys(report.warningsByType).length > 0) {
      console.log("\n[ADVERTENCIAS POR TIPO]:");
      for (const [type, count] of Object.entries(report.warningsByType)) {
        console.log(`  - ${type}: ${count}`);
      }
    }

    console.log("\n===============================================================");
    console.log("Resultado del Dry-Run: REVISIÓN COMPLETADA.");
    console.log("ESTADO: DETENIDO. No se escribieron datos en PostgreSQL.");
    console.log("===============================================================");
  } else {
    console.log("Ejecutando importación en base de datos PostgreSQL...\n");
    const result = await executeLoad(csvContent);

    console.log("===============================================================");
    console.log("             RESULTADO DE LA CARGA REAL (POSTGRESQL)           ");
    console.log("===============================================================");
    console.log(`Solicitudes importadas:    ${result.importedRequestsCount}`);
    console.log(`Clientes creados:          ${result.createdCustomersCount}`);
    console.log(`Errores en carga:          ${result.errors.length}`);
    if (result.errors.length > 0) {
      result.errors.forEach((e) => console.error(`  - ${e}`));
    }
    console.log("===============================================================");
  }
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err);
  process.exit(1);
});
