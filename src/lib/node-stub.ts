// Stub for node builtins in browser client build (excaliplant imports fs/path/url)
export default {};
export const readFileSync = () => { throw new Error("fs not available in browser"); };
export const existsSync = () => false;
export const join = (...args: string[]) => args.join("/");
export const resolve = (...args: string[]) => args.join("/");
export const dirname = (p: string) => p.split("/").slice(0,-1).join("/");
export const basename = (p: string) => p.split("/").pop() || "";
