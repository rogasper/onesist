export interface CompletenessResult {
  required: { label: string; heading: string; present: boolean }[];
  optional: { label: string; heading: string; present: boolean }[];
  missing: string[];
  warnings: string[];
  score: number;
}

const REQUIRED_SECTIONS: { label: string; heading: string }[] = [
  { label: "Context", heading: "context" },
  { label: "Problem Statement", heading: "problem statement" },
  { label: "Goals", heading: "goals" },
  { label: "Scope", heading: "scope" },
  { label: "Functional Requirements", heading: "functional requirements" },
  { label: "User Flow", heading: "user flow" },
  { label: "Data Requirements", heading: "data requirements" },
  { label: "Acceptance Criteria", heading: "acceptance criteria" },
];

const OPTIONAL_SECTIONS: { label: string; heading: string }[] = [
  { label: "Actors", heading: "actors" },
  { label: "Non-functional Requirements", heading: "non-functional requirements" },
  { label: "API Requirements", heading: "api requirements" },
  { label: "Open Questions", heading: "open questions" },
  { label: "Discussion Notes", heading: "discussion notes" },
  { label: "Notes", heading: "notes" },
];

export function checkCompleteness(content: string): CompletenessResult {
  const headings = new Set(
    (content.match(/^#{1,4}\s+(.+)$/gm) ?? []).map((h) =>
      h.replace(/^#{1,4}\s+/, "").toLowerCase().trim()
    ),
  );
  const matches = (heading: string) => {
    for (const h of headings) {
      if (h === heading || h.includes(heading) || heading.includes(h)) return true;
    }
    return false;
  };

  const required = REQUIRED_SECTIONS.map((s) => ({ ...s, present: matches(s.heading) }));
  const optional = OPTIONAL_SECTIONS.map((s) => ({ ...s, present: matches(s.heading) }));
  const missing = required.filter((r) => !r.present).map((r) => r.label);
  const warnings = optional.filter((o) => !o.present).map((o) => `${o.label} (optional)`);
  const score = Math.round((required.filter((r) => r.present).length / required.length) * 100);

  return { required, optional, missing, warnings, score };
}
