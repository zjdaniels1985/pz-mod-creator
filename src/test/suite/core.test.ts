import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { shouldIgnoreRelativePath } from "../../core/build";
import { NodeFileSystemAdapter, readTextFile } from "../../core/fs";
import {
  configureLuaIntellisense,
  updateLuaDefinitions,
} from "../../core/intellisense";
import {
  getContentVersionFolder,
  isPathInside,
  isWindowsReservedName,
  resolveConfiguredOutputDirectory,
  resolveModContentRoot,
  resolveModMediaRoot,
  resolveModRoot,
  resolveModsRoot,
  sanitizeModIdCandidate,
  sanitizePathSegment,
  validateModId,
} from "../../core/project";
import {
  buildModRenamePlan,
  isCaseOnlyRename,
  rewriteModIdReferences,
  writeModInfo,
} from "../../core/scaffold";
import { rewriteTranslationHeaders } from "../../core/translations";

/** Builds an expected path with the host separator, matching `path.join`. */
function p(...segments: string[]): string {
  return path.join(...segments);
}

/** Anchors a POSIX-style root to the current drive on win32. */
function abs(...segments: string[]): string {
  return path.resolve(path.join(...segments));
}

function eqPath(actual: string, expected: string, message?: string): void {
  assert.strictEqual(
    path.normalize(actual),
    path.normalize(expected),
    message === undefined ? undefined : new Error(message),
  );
}

function eqResolvedPath(
  actual: string,
  expected: string,
  message?: string,
): void {
  assert.strictEqual(
    path.resolve(actual),
    path.resolve(expected),
    message === undefined ? undefined : new Error(message),
  );
}

describe("core logic", () => {
  const projectRoot = abs("/workspace/MyProject");

  it("resolves build target paths correctly", () => {
    eqPath(
      resolveModsRoot(projectRoot, "b42"),
      p(projectRoot, "Contents", "mods"),
    );
    eqPath(resolveModsRoot(projectRoot, "b41"), p(projectRoot, "mods"));
    eqPath(
      resolveModRoot(projectRoot, "b42", "TestMod"),
      p(projectRoot, "Contents", "mods", "TestMod"),
    );
    eqPath(
      resolveModContentRoot(projectRoot, "b42", "TestMod"),
      p(projectRoot, "Contents", "mods", "TestMod", "42.0"),
    );
    eqPath(
      resolveModContentRoot(projectRoot, "b41", "TestMod"),
      p(projectRoot, "mods", "TestMod"),
    );
    eqPath(
      resolveModMediaRoot(projectRoot, "b42", "TestMod"),
      p(projectRoot, "Contents", "mods", "TestMod", "42.0", "media"),
    );
    assert.strictEqual(getContentVersionFolder("b42"), "42.0");
    assert.strictEqual(getContentVersionFolder("b41"), undefined);
  });

  it("resolves output directory defaults and relative overrides", () => {
    const home = abs("/home/alice");
    const workspace = abs("/workspace/mods");

    eqResolvedPath(
      resolveConfiguredOutputDirectory("", home, workspace),
      p(home, "Zomboid", "Workshop"),
    );
    eqResolvedPath(
      resolveConfiguredOutputDirectory("build-output", home, workspace),
      p(workspace, "build-output"),
    );
  });

  it("expands tilde and ${userHome} tokens", () => {
    const home = abs("/home/alice");

    eqResolvedPath(
      resolveConfiguredOutputDirectory("~/Zomboid/Workshop", home),
      p(home, "Zomboid", "Workshop"),
    );
    eqResolvedPath(
      resolveConfiguredOutputDirectory("${userHome}/Zomboid/Workshop", home),
      p(home, "Zomboid", "Workshop"),
    );
  });

  it("validates mod identifiers", () => {
    assert.strictEqual(validateModId("Valid.Mod_01").valid, true);
    assert.strictEqual(validateModId("bad id").valid, false);
    assert.strictEqual(validateModId("bad/id").valid, false);
    assert.strictEqual(sanitizeModIdCandidate("My Mod!"), "MyMod");
  });

  it("rejects Windows reserved device names", () => {
    for (const reserved of [
      "CON",
      "con",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "LPT9",
    ]) {
      assert.strictEqual(
        isWindowsReservedName(reserved),
        true,
        `${reserved} should be reserved`,
      );
      assert.strictEqual(
        validateModId(reserved).valid,
        false,
        `${reserved} should be rejected`,
      );
    }

    assert.strictEqual(validateModId("CONSOLE").valid, true);
    assert.strictEqual(isWindowsReservedName("CON.txt"), true);
    assert.strictEqual(sanitizePathSegment("CON"), "CON-mod");
    assert.strictEqual(sanitizeModIdCandidate("NUL"), "NULMod");
  });

  it("strips trailing dots, spaces, and backslashes from path segments", () => {
    assert.strictEqual(sanitizePathSegment("My Mod."), "My-Mod");
    assert.strictEqual(sanitizePathSegment("My Mod "), "My-Mod");
    assert.strictEqual(sanitizePathSegment("My\\Mod"), "My-Mod");
    assert.strictEqual(validateModId("BadId.").valid, false);
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
      shouldIgnoreRelativePath(".types/umbrella/file.lua", ignoreGlobs),
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

  it("filters ignored build files given native separators", () => {
    const ignoreGlobs = ["**/.git/**", ".types/**"];

    assert.strictEqual(
      shouldIgnoreRelativePath(
        p(".types", "umbrella", "file.lua"),
        ignoreGlobs,
      ),
      true,
      "native separators must normalize before glob matching",
    );
  });

  it("detects containment for output safety checks", () => {
    const parent = abs("/home/alice/Zomboid/Workshop");

    assert.strictEqual(isPathInside(parent, p(parent, "MyProject")), true);
    assert.strictEqual(isPathInside(parent, parent), true);
    assert.strictEqual(
      isPathInside(parent, abs("/home/alice/Zomboid")),
      false,
      "must reject escaping the configured output directory",
    );
  });

  it("creates the expected rename plan for a mod", () => {
    const root = abs("/workspace/Project");
    const plan = buildModRenamePlan(root, "b42", "OldMod", "NewMod");

    eqPath(plan[0].from, p(root, "Contents", "mods", "OldMod"));
    eqPath(plan[0].to, p(root, "Contents", "mods", "NewMod"));

    assert.deepStrictEqual(
      plan.slice(1).map((entry) => path.normalize(entry.to)),
      [
        p(
          root,
          "Contents",
          "mods",
          "NewMod",
          "42.0",
          "media",
          "lua",
          "client",
          "NewMod",
        ),
        p(
          root,
          "Contents",
          "mods",
          "NewMod",
          "42.0",
          "media",
          "lua",
          "server",
          "NewMod",
        ),
        p(
          root,
          "Contents",
          "mods",
          "NewMod",
          "42.0",
          "media",
          "lua",
          "shared",
          "NewMod",
        ),
      ].map((expected) => path.normalize(expected)),
    );
  });

  it("detects case-only renames", () => {
    assert.strictEqual(isCaseOnlyRename("MyMod", "mymod"), true);
    assert.strictEqual(isCaseOnlyRename("MyMod", "MyMod"), false);
    assert.strictEqual(isCaseOnlyRename("MyMod", "OtherMod"), false);
  });

  it("writes b42 mod.info root and version copies while omitting empty values", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pzmc-core-"));
    const fileSystem = new NodeFileSystemAdapter();
    try {
      const mod = {
        id: "MyMod",
        name: "My Mod",
        description: "line one\nline two",
        author: "Alice",
        version: "1.2.3",
        requires: [],
      };
      await writeModInfo(fileSystem, "", tempRoot, "b42", mod);

      const rootInfo = await readTextFile(
        fileSystem,
        path.join(tempRoot, "Contents", "mods", "MyMod", "mod.info"),
      );
      const versionInfo = await readTextFile(
        fileSystem,
        path.join(tempRoot, "Contents", "mods", "MyMod", "42.0", "mod.info"),
      );

      assert.strictEqual(rootInfo.includes("versionMin="), false);
      assert.strictEqual(rootInfo.includes("require="), false);
      assert.strictEqual(rootInfo.includes("author=Alice"), true);
      assert.strictEqual(
        rootInfo.includes("description=line one line two"),
        true,
      );
      assert.strictEqual(versionInfo.includes("versionMin=42.0"), true);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes .emmyrc.json for new IntelliSense config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pzmc-emmy-"));
    const fileSystem = new NodeFileSystemAdapter();
    try {
      await configureLuaIntellisense(fileSystem, tempRoot, "b42");

      const emmyConfig = JSON.parse(
        await readTextFile(fileSystem, path.join(tempRoot, ".emmyrc.json")),
      ) as {
        workspace: {
          library: string[];
        };
        diagnostics: {
          enable: boolean;
          disable: string[];
          enables: string[];
          globals: string[];
          severity: Record<string, string>;
        };
      };

      assert.deepStrictEqual(emmyConfig.workspace.library, [
        ".types/umbrella/library",
        "Contents/mods",
      ]);
      assert.strictEqual(emmyConfig.diagnostics.enable, true);
      assert.strictEqual(
        emmyConfig.diagnostics.enables.includes("undefined-global"),
        true,
      );
      assert.strictEqual(
        emmyConfig.diagnostics.enables.includes("global-in-non-module"),
        true,
      );
      assert.deepStrictEqual(emmyConfig.diagnostics.globals, [
        "Events",
        "SandboxVars",
        "getPlayer",
        "getSpecificPlayer",
        "ProceduralDistributions",
        "Perks",
      ]);
      assert.strictEqual(
        emmyConfig.diagnostics.severity["undefined-global"],
        "warning",
      );
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("downloads definitions from the latest release tag when available", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pzmc-release-"));
    const fileSystem = new NodeFileSystemAdapter();
    const urls: string[] = [];

    const fetchMock = async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);

      if (
        url ===
        "https://api.github.com/repos/PZ-Umbrella/Umbrella/releases/latest"
      ) {
        return new Response(JSON.stringify({ tag_name: "42.20.0" }), {
          status: 200,
        });
      }

      if (
        url ===
        "https://api.github.com/repos/PZ-Umbrella/Umbrella/git/trees/42.20.0?recursive=1"
      ) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "library/Umbrella.lua", type: "blob" },
              { path: "README.md", type: "blob" },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        url ===
        "https://raw.githubusercontent.com/PZ-Umbrella/Umbrella/42.20.0/library/Umbrella.lua"
      ) {
        return new Response("---@class Umbrella\n", { status: 200 });
      }

      return new Response("not found", { status: 404 });
    };

    try {
      const result = await updateLuaDefinitions(
        fileSystem,
        tempRoot,
        undefined,
        fetchMock as typeof fetch,
      );

      assert.strictEqual(result.failures.length, 0);
      assert.strictEqual(result.summaries[0]?.filesDownloaded, 1);
      assert.strictEqual(
        urls.includes(
          "https://api.github.com/repos/PZ-Umbrella/Umbrella/releases/latest",
        ),
        true,
      );

      const manifest = JSON.parse(
        await readTextFile(
          fileSystem,
          path.join(tempRoot, ".types", "umbrella", "manifest.json"),
        ),
      ) as {
        ref: string;
        refType: string;
      };
      assert.strictEqual(manifest.ref, "42.20.0");
      assert.strictEqual(manifest.refType, "release");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("falls back to the default branch when latest release is unavailable", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pzmc-fallback-"));
    const fileSystem = new NodeFileSystemAdapter();

    const fetchMock = async (input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "https://api.github.com/repos/PZ-Umbrella/Umbrella/releases/latest"
      ) {
        return new Response("not found", { status: 404 });
      }

      if (url === "https://api.github.com/repos/PZ-Umbrella/Umbrella") {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
        });
      }

      if (
        url ===
        "https://api.github.com/repos/PZ-Umbrella/Umbrella/git/trees/main?recursive=1"
      ) {
        return new Response(
          JSON.stringify({
            tree: [{ path: "library/Umbrella.lua", type: "blob" }],
          }),
          { status: 200 },
        );
      }

      if (
        url ===
        "https://raw.githubusercontent.com/PZ-Umbrella/Umbrella/main/library/Umbrella.lua"
      ) {
        return new Response("---@class Umbrella\n", { status: 200 });
      }

      return new Response("not found", { status: 404 });
    };

    try {
      const result = await updateLuaDefinitions(
        fileSystem,
        tempRoot,
        undefined,
        fetchMock as typeof fetch,
      );

      assert.strictEqual(result.failures.length, 0);

      const manifest = JSON.parse(
        await readTextFile(
          fileSystem,
          path.join(tempRoot, ".types", "umbrella", "manifest.json"),
        ),
      ) as {
        ref: string;
        refType: string;
      };
      assert.strictEqual(manifest.ref, "main");
      assert.strictEqual(manifest.refType, "branch");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rewrites known mod-id reference patterns without touching unrelated text", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pzmc-rewrite-"));
    const fileSystem = new NodeFileSystemAdapter();
    try {
      await fs.mkdir(path.join(tempRoot, "media"), { recursive: true });
      const luaFile = path.join(tempRoot, "media", "sample.lua");
      const txtFile = path.join(tempRoot, "media", "scripts.txt");
      const untouchedFile = path.join(tempRoot, "media", "notes.md");

      await fs.writeFile(
        luaFile,
        [
          'require("OldId/Foo")',
          'require "OldId/Bar"',
          'require("Something/OldId_Shared")',
          'MOD_ID = "OldId"',
          'sendClientCommand(player, "OldId", "Cmd", args)',
          'sendServerCommand("OldId", "Cmd", args)',
          'ModData.get("OldId")',
          "-- OldId in a comment should stay",
          'local text = "OldId should stay here"',
        ].join("\n"),
      );
      await fs.writeFile(txtFile, 'module=OldId\nvalue="OldId"\n');
      await fs.writeFile(untouchedFile, 'require("OldId/Foo")\n');

      const results = await rewriteModIdReferences(
        fileSystem,
        path.join(tempRoot, "media"),
        "OldId",
        "NewId",
      );

      const updatedLua = await fs.readFile(luaFile, "utf8");
      const updatedTxt = await fs.readFile(txtFile, "utf8");
      const updatedMd = await fs.readFile(untouchedFile, "utf8");
      const byFile = new Map(results.map((item) => [item.filePath, item]));

      assert.strictEqual(updatedLua.includes('require("NewId/Foo")'), true);
      assert.strictEqual(updatedLua.includes('require "NewId/Bar"'), true);
      assert.strictEqual(
        updatedLua.includes('require("Something/NewId_Shared")'),
        true,
      );
      assert.strictEqual(updatedLua.includes('MOD_ID = "NewId"'), true);
      assert.strictEqual(
        updatedLua.includes('sendClientCommand(player, "NewId", "Cmd", args)'),
        true,
      );
      assert.strictEqual(
        updatedLua.includes('sendServerCommand("NewId", "Cmd", args)'),
        true,
      );
      assert.strictEqual(updatedLua.includes('ModData.get("NewId")'), true);
      assert.strictEqual(
        updatedLua.includes("-- OldId in a comment should stay"),
        true,
      );
      assert.strictEqual(
        updatedLua.includes('local text = "OldId should stay here"'),
        true,
      );
      assert.strictEqual(updatedTxt.includes("module=OldId"), true);
      assert.strictEqual(updatedTxt.includes('value="OldId"'), true);
      assert.strictEqual(updatedMd.includes('require("OldId/Foo")'), true);
      assert.strictEqual(byFile.has(luaFile), true);
      assert.strictEqual(byFile.get(luaFile)?.replacements, 7);
      assert.strictEqual(byFile.has(txtFile), false);
      assert.strictEqual(byFile.has(untouchedFile), false);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
