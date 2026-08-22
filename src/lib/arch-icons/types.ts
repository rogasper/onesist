export interface IconShape {
  id: string;
  pack: string;
  category: string;
  label: string;
  file: string; // relative to public/icons, e.g. aws/Analytics/Athena.svg
  keywords: string[];
}

export interface IconManifest {
  generatedAt: string;
  total: number;
  packs: Record<string, number>;
  shapes: IconShape[];
}

export interface TechIconMapping {
  keywords: string[]; // lowercased match tokens
  file: string; // public/icons/...svg
  label: string;
}
