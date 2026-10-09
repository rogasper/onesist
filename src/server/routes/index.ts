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
import { router as handoffRouter } from "./projects/handoff";
import { router as fsdRouter } from "./projects/fsd";
import { router as assetsRouter } from "./projects/assets";
import { router as rtmRouter } from "./projects/rtm";
import { router as sitRouter } from "./projects/sit";
import { router as canvasRouter } from "./canvas";
import { router as providersRouter } from "./providers";
import { router as chatRouter } from "./chat";
import { router as settingsRouter } from "./settings";
import { router as browserRouter } from "./browser";

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
  handoffRouter,
  fsdRouter,
  assetsRouter,
  rtmRouter,
  sitRouter,
  canvasRouter,
  providersRouter,
  chatRouter,
  settingsRouter,
  browserRouter,
];
