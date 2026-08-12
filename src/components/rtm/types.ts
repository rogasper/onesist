import type {
  BusinessRequirement,
  DesignSolution,
  FunctionalRequirement,
  TestCase,
} from "~/shared/types";

export type EntityKind = "br" | "fr" | "design" | "test";

export type RtmEntity = BusinessRequirement | FunctionalRequirement | DesignSolution | TestCase;
