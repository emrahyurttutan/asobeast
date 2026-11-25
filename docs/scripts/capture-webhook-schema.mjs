import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARED = join(ROOT, "packages", "shared");
const OUTPUT_DIR = join(ROOT, "docs", "api-reference");
const SCHEMA = join(OUTPUT_DIR, "webhook-payloads.schema.json");
const EXAMPLES = join(OUTPUT_DIR, "webhook-payloads.examples.json");
const CHECK = process.argv.includes("--check");

function serialize(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function generateSchema() {
  const schema = createGenerator({
    path: join(SHARED, "src", "contracts", "changes.ts"),
    tsconfig: join(SHARED, "tsconfig.json"),
    type: "AlertPayload",
    expose: "export",
    topRef: true,
    jsDoc: "none",
    additionalProperties: true,
    skipTypeCheck: true,
  }).createSchema("AlertPayload");
  return {
    ...schema,
    title: "AsoBeast webhook payload",
    description:
      "The JSON body AsoBeast posts to a webhook that is not a chat service. Generated from the AlertPayload type of @asobeast/shared. Fields are only ever added within a major version, so accept properties you do not know.",
  };
}

async function loadExamples() {
  const source = join(SHARED, "src", "contracts", "webhook-examples.ts");
  const { WEBHOOK_PAYLOAD_EXAMPLES } = await import(pathToFileURL(source).href);
  return WEBHOOK_PAYLOAD_EXAMPLES;
}

async function differs(path, expected) {
  try {
    return (await readFile(path, "utf8")) !== expected;
  } catch {
    return true;
  }
}

async function main() {
  const outputs = [
    [SCHEMA, serialize(generateSchema())],
    [EXAMPLES, serialize(await loadExamples())],
  ];

  if (!CHECK) {
    for (const [path, content] of outputs) {
      await writeFile(path, content);
      console.log(`wrote ${path}`);
    }
    return;
  }

  const stale = [];
  for (const [path, content] of outputs) {
    if (await differs(path, content)) stale.push(path);
  }
  if (stale.length > 0) {
    console.error(
      `${stale.join(" and ")} drifted from the webhook payload types, run pnpm docs:webhook-schema and commit the result`,
    );
    process.exit(1);
  }
  console.log("the webhook payload schema and examples match the types");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
