// Lets node:test run the app's TypeScript without extra dependencies:
// resolves the "@/" path alias and extensionless imports, then compiles
// .ts/.tsx with the project's own TypeScript (Node's built-in type
// stripping rejects parameter properties used in lib/connection-auth.ts).
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(fileURLToPath(import.meta.url), "../../..");
const extensions = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveFile(base) {
  if (existsSync(base) && !existsSync(path.join(base, "package.json"))) {
    if (/\.[cm]?[jt]sx?$/.test(base)) return base;
  }
  for (const extension of extensions) {
    if (existsSync(base + extension)) return base + extension;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;

    if (specifier.startsWith("@/")) {
      base = path.join(root, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }

    const file = base && resolveFile(base);
    if (file && /\.tsx?$/.test(file)) {
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (!url.startsWith("file:") || !/\.tsx?$/.test(url)) {
      return nextLoad(url, context);
    }

    const filename = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        sourceMap: false,
        inlineSourceMap: true,
      },
    });

    return { format: "commonjs", source: outputText, shortCircuit: true };
  },
});
