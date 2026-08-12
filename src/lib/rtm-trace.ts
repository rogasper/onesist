import type { FunctionalRequirement, RtmLink } from "~/shared/types";

export type FrTraceStatus = "lengkap" | "test-kurang" | "desain-kurang" | "belum";

export interface FrTrace {
  hasDesign: boolean;
  hasTest: boolean;
  brTraced: boolean;
  status: FrTraceStatus;
  designLinkIds: string[];
  testLinkIds: string[];
}

/** Derive trace status for one functional requirement from the RTM links. */
export function deriveFrTrace(fr: FunctionalRequirement, links: RtmLink[]): FrTrace {
  const designLinkIds: string[] = [];
  const testLinkIds: string[] = [];
  for (const link of links) {
    if (link.frId !== fr.id) continue;
    if (link.dsId) designLinkIds.push(link.dsId);
    if (link.tcId) testLinkIds.push(link.tcId);
  }
  const hasDesign = designLinkIds.length > 0;
  const hasTest = testLinkIds.length > 0;
  const brTraced = !!fr.brId;

  let status: FrTraceStatus = "belum";
  if (hasDesign && hasTest) status = "lengkap";
  else if (hasDesign) status = "test-kurang";
  else if (hasTest) status = "desain-kurang";

  return { hasDesign, hasTest, brTraced, status, designLinkIds, testLinkIds };
}

export interface TraceSummary {
  frCount: number;
  brMapped: number;
  brUnmapped: number;
  full: number;
  designOnly: number;
  testOnly: number;
  none: number;
  designCount: number;
  testCount: number;
}

export function summarizeTrace(frs: FunctionalRequirement[], links: RtmLink[]): TraceSummary {
  let brMapped = 0, full = 0, designOnly = 0, testOnly = 0, none = 0;
  for (const fr of frs) {
    const t = deriveFrTrace(fr, links);
    if (t.brTraced) brMapped++;
    if (t.status === "lengkap") full++;
    else if (t.status === "test-kurang") designOnly++;
    else if (t.status === "desain-kurang") testOnly++;
    else none++;
  }
  return {
    frCount: frs.length,
    brMapped,
    brUnmapped: frs.length - brMapped,
    full,
    designOnly,
    testOnly,
    none,
    designCount: links.filter((l) => l.dsId).length,
    testCount: links.filter((l) => l.tcId).length,
  };
}
