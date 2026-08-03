import { unpluginRouterGeneratorFactory } from "@tanstack/router-plugin";

const plugin = unpluginRouterGeneratorFactory({ srcDirectory: "src" });
await plugin.vite.configResolved({ root: new URL("..", import.meta.url).pathname });
