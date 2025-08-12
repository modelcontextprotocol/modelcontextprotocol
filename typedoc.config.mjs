// @ts-check

/** @type {Partial<import("typedoc").TypeDocOptions>} */
const config = {
  out: "tmp",
  excludeInternal: true,
  excludeTags: [
    "@format",
    "@maximum",
    "@minimum",
  ],
  disableSources: true,
  logLevel: "Error",
  plugin: ["./typedoc.plugin.mjs"],
};

export default config;
