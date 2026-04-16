const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ts = require("typescript");

const SOURCE_PATH = path.resolve(__dirname, "..", "..", "..", "frontend", "src", "agents", "orchestrator.ts");
const CACHE_DIR = path.resolve(process.cwd(), ".cache");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function compileOrchestratorSource() {
  const source = fs.readFileSync(SOURCE_PATH, "utf8");
  const sourceHash = crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);
  const outFile = path.join(CACHE_DIR, `orchestrator.runtime.${sourceHash}.cjs`);

  if (!fs.existsSync(outFile)) {
    const normalizedSource = source.replace(/import\.meta\.env\./g, "process.env.");
    const transpiled = ts.transpileModule(normalizedSource, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: SOURCE_PATH,
    });

    fs.writeFileSync(outFile, transpiled.outputText, "utf8");
  }

  return outFile;
}

function loadOrchestratorModule() {
  ensureCacheDir();
  const compiledPath = compileOrchestratorSource();

  delete require.cache[compiledPath];
  return require(compiledPath);
}

module.exports = {
  loadOrchestratorModule,
};
