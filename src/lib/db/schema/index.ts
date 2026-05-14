// Re-export every schema module so Drizzle can discover them all from a
// single entry point. Mirrors event-calendar/db/schema/index.ts.

export * from "./core";
export * from "./mreport";
