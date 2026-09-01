import { readFile } from "node:fs/promises";
import { verifyAuthorizedTrace } from "../src/write-trace-verifier.mjs";

const tracePath = process.argv[2];
if (!tracePath) {
  console.error("Usage: npm run trace:verify -- <sanitized-trace.json>");
  process.exitCode = 2;
} else {
  try {
    const trace = JSON.parse(await readFile(tracePath, "utf8"));
    console.log(JSON.stringify(verifyAuthorizedTrace(trace), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
