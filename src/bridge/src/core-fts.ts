// Runtime JS is the vendored core's supported entry; do not compile its TS tree here.
const path = '../../../vendor/tencentdb/src/core/store/sqlite.js';
const core = await import(path) as {
  buildFtsQuery: (text: string) => string | null;
  tokenizeForFts: (text: string) => string;
};
export const { buildFtsQuery, tokenizeForFts } = core;
