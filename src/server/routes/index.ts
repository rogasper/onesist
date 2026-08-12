import { router as systemRouter } from "./system";
import { router as sseRouter } from "./sse";
import { router as filesRouter } from "./files";
import { router as projectsRouter } from "./projects";
import { router as skillsRouter } from "./projects/skills";
import { router as erdsRouter } from "./projects/erds";
import { router as specsRouter } from "./projects/specs";
import { router as wikiRouter } from "./projects/wiki";
import { router as docsRouter } from "./projects/docs";
import { router as tasksRouter } from "./projects/tasks";
import { router as fsdRouter } from "./projects/fsd";
import { router as rtmRouter } from "./projects/rtm";

export const routers = [
  systemRouter,
  sseRouter,
  filesRouter,
  projectsRouter,
  skillsRouter,
  erdsRouter,
  specsRouter,
  wikiRouter,
  docsRouter,
  tasksRouter,
  fsdRouter,
  rtmRouter,
];
