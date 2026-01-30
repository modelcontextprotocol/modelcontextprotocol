// @ts-check

/** @type {Partial<import("typedoc").TypeDocOptions>} */
const config = {
  out: "tmp",
  sort: ["source-order"],
  excludeInternal: true,
  excludeTags: [
    "@format",
    "@maximum",
    "@minimum",
    "@TJS-type",
  ],
  jsDocCompatibility: {
    exampleTag: false,
  },
  disableSources: true,
  logLevel: "Error",
  plugin: ["./typedoc.plugin.mjs"],
};

export default config;
