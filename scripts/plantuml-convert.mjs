#!/usr/bin/env node
import { readFileSync } from "node:fs";

const code = readFileSync(0, "utf-8");
try {
  const { parsePlantUml } = await import("@grethel-labs/excaliplant/main/parser");
  const { layoutDiagramWithModule, exportDiagramWithModule } = await import("@grethel-labs/excaliplant/main/pipeline");
  const diagram = parsePlantUml(code);
  await layoutDiagramWithModule(diagram);
  const doc = exportDiagramWithModule(diagram, { sourceLabel: "plantuml" });
  process.stdout.write(JSON.stringify({ elements: doc.elements || [], files: doc.files || {} }));
} catch (e) {
  console.error(e);
  process.stderr.write(e?.message || String(e));
  process.exit(1);
}
