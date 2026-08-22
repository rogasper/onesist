// Stub for @resvg/resvg-js in browser client build — PNG export not needed there
export const Resvg = class { constructor() { throw new Error("Resvg not available in browser"); } };
export default { Resvg };
