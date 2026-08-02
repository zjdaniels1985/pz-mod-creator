import * as assert from "node:assert";
import * as path from "node:path";

import { shouldIgnoreRelativePath } from "../../core/build";
import {
  resolveConfiguredOutputDirectory,
  resolveModRoot,
  resolveModsRoot,
  sanitizeModIdCandidate,
  validateModId,
} from "../../core/project";
import { buildModRenamePlan } from "../../core/scaffold";
import { rewriteTranslationHeaders } from "../../core/translations";

describe("core logic", () => {
  it("resolves build target paths correctly", () => {
    const projectRoot = "/workspace/MyProject";
    assert.strictEqual(
      resolveModsRoot(projectRoot, "b42"),
      "/workspace/MyProject/Contents/mods",
    );
    assert.strictEqual(
      resolveModsRoot(projectRoot, "b41"),
      "/workspace/MyProject/mods",
    );
    assert.strictEqual(
      resolveModRoot(projectRoot, "b42", "TestMod"),
      "/workspace/MyProject/Contents/mods/TestMod",
    );
  });

  it("resolves output directory defaults and relative overrides", () => {
    assert.strictEqual(
      resolveConfiguredOutputDirectory("", "/home/alice", "/workspace/mods"),
      "/home/alice/Zomboid/Workshop",
    );
    assert.strictEqual(
      resolveConfiguredOutputDirectory(
        "build-output",
        "/home/alice",
        "/workspace/mods",
      ),
      "/workspace/mods/build-output",
    );
  });

  it("validates mod identifiers", () => {
    assert.strictEqual(validateModId("Valid.Mod_01").valid, true);
    assert.strictEqual(validateModId("bad id").valid, false);
    assert.strictEqual(validateModId("bad/id").valid, false);
    assert.strictEqual(sanitizeModIdCandidate("My Mod!"), "MyMod");
  });

  it("rewrites translation headers to the target language", () => {
    const source = `IG_UI_EN = {
}
`;
    assert.strictEqual(
      rewriteTranslationHeaders(source, "FR"),
      `IG_UI_FR = {
}
`,
    );
  });

  it("filters ignored build files using glob rules", () => {
    const ignoreGlobs = ["**/.git/**", "**/node_modules/**", ".types/**"];
    assert.strictEqual(
      shouldIgnoreRelativePath(".types/candle/file.lua", ignoreGlobs),
      true,
    );
    assert.strictEqual(
      shouldIgnoreRelativePath(
        "mods/MyMod/media/lua/shared/Test.lua",
        ignoreGlobs,
      ),
      false,
    );
    assert.strictEqual(
      shouldIgnoreRelativePath("node_modules/pkg/index.js", ignoreGlobs),
      true,
    );
  });

  it("creates the expected rename plan for a mod", () => {
    const plan = buildModRenamePlan(
      "/workspace/Project",
      "b42",
      "OldMod",
      "NewMod",
    );
    assert.strictEqual(plan[0].from, "/workspace/Project/Contents/mods/OldMod");
    assert.strictEqual(plan[0].to, "/workspace/Project/Contents/mods/NewMod");
    assert.deepStrictEqual(
      plan.slice(1).map((entry) => path.normalize(entry.to)),
      [
        "/workspace/Project/Contents/mods/NewMod/media/lua/client/NewMod",
        "/workspace/Project/Contents/mods/NewMod/media/lua/server/NewMod",
        "/workspace/Project/Contents/mods/NewMod/media/lua/shared/NewMod",
      ],
    );
  });
});
