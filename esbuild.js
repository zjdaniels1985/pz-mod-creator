const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

/**
 * Emits the begin/end markers and error format that the `watch` task's
 * problem matcher in .vscode/tasks.json parses. Keep the log strings in sync
 * with the beginsPattern / endsPattern defined there.
 */
const watchMarkersPlugin = {
  name: "watch-markers",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });

    build.onEnd((result) => {
      for (const error of result.errors) {
        console.error(`✘ [ERROR] ${error.text}`);
        if (error.location) {
          const { file, line, column } = error.location;
          console.error(`    ${file}:${line}:${column}:`);
        }
      }

      for (const warning of result.warnings) {
        console.warn(`▲ [WARNING] ${warning.text}`);
        if (warning.location) {
          const { file, line, column } = warning.location;
          console.warn(`    ${file}:${line}:${column}:`);
        }
      }

      console.log("[watch] build finished");
    });
  },
};

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  external: ["vscode"],
  // The plugin prints its own diagnostics, so silence esbuild's duplicate
  // output while watching.
  logLevel: watch ? "silent" : "info",
  plugins: watch ? [watchMarkersPlugin] : [],
};

async function run() {
  if (watch) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    return;
  }

  await esbuild.build(buildOptions);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
