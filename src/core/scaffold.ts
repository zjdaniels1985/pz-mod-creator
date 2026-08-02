import { readFile as readNodeFile } from "node:fs/promises";
import * as path from "node:path";

import {
  ensureDirectory,
  readTextFile,
  type FileSystemAdapter,
  writeJsonFile,
  writeTextFile,
} from "./fs";
import {
  createProjectConfig,
  getContentVersionFolder,
  getVersionMin,
  resolveModMediaRoot,
  resolveModRoot,
  resolveModsRoot,
  resolveProjectFilePath,
  resolveTranslationRoot,
  sanitizePathSegment,
  type BuildTarget,
  type ModDefinition,
  type ProjectConfig,
} from "./project";
import { addTranslationLanguage } from "./translations";

const PLACEHOLDER_PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00,
  0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

const LUA_SCOPES = ["client", "server", "shared"] as const;

/** File extensions whose contents are rewritten during a mod rename. */
const RENAMEABLE_CONTENT_EXTENSIONS = new Set([".lua", ".txt"]);

export interface ProjectScaffoldInput {
  projectRoot: string;
  templateRoot: string;
  projectName: string;
  workshopTitle: string;
  description: string;
  author: string;
  buildTarget: BuildTarget;
  firstMod: ModDefinition;
}

export interface ModScaffoldInput {
  projectRoot: string;
  templateRoot: string;
  buildTarget: BuildTarget;
  mod: ModDefinition;
}

export interface RenamePathPair {
  from: string;
  to: string;
}

export interface ContentRewriteResult {
  filePath: string;
  replacements: number;
}

async function loadTemplate(
  templateRoot: string,
  templateName: string,
): Promise<string> {
  return await readNodeFile(path.join(templateRoot, templateName), "utf8");
}

function renderTemplate(
  template: string,
  tokens: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_match, key: string) => tokens[key] ?? "",
  );
}

function buildWorkshopDescriptionLines(description: string): string {
  if (!description.trim()) {
    return "description=";
  }

  return description
    .split(/\r?\n/)
    .map((line) => `description=${line}`)
    .join("\n");
}

/**
 * Renders mod.info from key/value pairs rather than a template so empty fields
 * can be omitted entirely. A blank `require=` makes the game treat it as a
 * dependency on a mod with an empty ID, which silently hides the mod from the
 * in-game list with no error logged.
 *
 * Pass versionMin only for the file that should declare it: on B42 that is the
 * version-folder copy, not the root one.
 */
function renderModInfo(mod: ModDefinition, versionMin?: string): string {
  const fields: [string, string][] = [
    ["name", mod.name],
    ["id", mod.id],
    ["description", mod.description.replace(/\r?\n/g, " ").trim()],
    ["poster", "poster.png"],
    ["author", mod.author],
    ["modversion", mod.version],
    ["versionMin", versionMin ?? ""],
    ["require", mod.requires.join(",")],
  ];

  return (
    fields
      .filter(([, value]) => value.trim().length > 0)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n"
  );
}

/**
 * Writes mod.info. On B42 two copies are written: a root discovery stub without
 * versionMin, and one inside the version folder that declares it.
 */
export async function writeModInfo(
  fileSystem: FileSystemAdapter,
  _templateRoot: string,
  projectRoot: string,
  buildTarget: BuildTarget,
  mod: ModDefinition,
): Promise<void> {
  const modRoot = resolveModRoot(projectRoot, buildTarget, mod.id);
  const versionFolder = getContentVersionFolder(buildTarget);

  if (!versionFolder) {
    await writeTextFile(
      fileSystem,
      path.join(modRoot, "mod.info"),
      renderModInfo(mod, getVersionMin(buildTarget)),
    );
    return;
  }

  await writeTextFile(
    fileSystem,
    path.join(modRoot, "mod.info"),
    renderModInfo(mod),
  );
  await writeTextFile(
    fileSystem,
    path.join(modRoot, versionFolder, "mod.info"),
    renderModInfo(mod, getVersionMin(buildTarget)),
  );
}

/**
 * Writes a starter Lua file for each scope, named <ModId>_<Scope>.lua so the
 * rename command's file matcher picks them up if the mod ID changes.
 */
async function writeStarterLuaFiles(
  fileSystem: FileSystemAdapter,
  templateRoot: string,
  luaRoot: string,
  mod: ModDefinition,
): Promise<void> {
  for (const scope of LUA_SCOPES) {
    const template = await loadTemplate(templateRoot, `${scope}.lua.tpl`);
    const rendered = renderTemplate(template, {
      modId: mod.id,
      modName: mod.name,
      version: mod.version,
    });

    const suffix = scope.charAt(0).toUpperCase() + scope.slice(1);
    await writeTextFile(
      fileSystem,
      path.join(luaRoot, scope, mod.id, `${mod.id}_${suffix}.lua`),
      rendered,
    );
  }
}

export async function scaffoldMod(
  fileSystem: FileSystemAdapter,
  input: ModScaffoldInput,
): Promise<void> {
  const modRoot = resolveModRoot(
    input.projectRoot,
    input.buildTarget,
    input.mod.id,
  );
  const mediaRoot = resolveModMediaRoot(
    input.projectRoot,
    input.buildTarget,
    input.mod.id,
  );
  const luaRoot = path.join(mediaRoot, "lua");

  await ensureDirectory(
    fileSystem,
    resolveModsRoot(input.projectRoot, input.buildTarget),
  );
  for (const scope of LUA_SCOPES) {
    await ensureDirectory(fileSystem, path.join(luaRoot, scope, input.mod.id));
  }
  await ensureDirectory(fileSystem, path.join(mediaRoot, "textures"));
  await ensureDirectory(fileSystem, path.join(mediaRoot, "scripts"));
  await ensureDirectory(
    fileSystem,
    resolveTranslationRoot(input.projectRoot, input.buildTarget, input.mod.id),
  );

  await writeStarterLuaFiles(
    fileSystem,
    input.templateRoot,
    luaRoot,
    input.mod,
  );
  await writeModInfo(
    fileSystem,
    input.templateRoot,
    input.projectRoot,
    input.buildTarget,
    input.mod,
  );

  // poster.png stays at the mod root even on B42, alongside the discovery stub.
  await fileSystem.writeFile(
    path.join(modRoot, "poster.png"),
    PLACEHOLDER_PNG_BYTES,
  );
  await addTranslationLanguage(
    fileSystem,
    resolveTranslationRoot(input.projectRoot, input.buildTarget, input.mod.id),
    "EN",
    true,
  );
}

/**
 * Renders the project README. Paths shown are illustrative, so a POSIX-style
 * example is used regardless of host platform.
 */
async function writeProjectReadme(
  fileSystem: FileSystemAdapter,
  input: ProjectScaffoldInput,
): Promise<void> {
  const template = await loadTemplate(input.templateRoot, "README.md.tpl");
  const versionFolder = getContentVersionFolder(input.buildTarget);

  const rendered = renderTemplate(template, {
    workshopTitle: input.workshopTitle,
    description: input.description.trim() || "_No description provided._",
    author: input.author || "Unknown",
    buildTarget: input.buildTarget,
    buildTag: input.buildTarget === "b42" ? "Build 42" : "Build 41",
    modId: input.firstMod.id,
    modsRootLabel: input.buildTarget === "b42" ? "Contents/mods" : "mods",
    versionFolderLine: versionFolder
      ? `${versionFolder}/           Version folder. Build 42 loads content from\n        |                  here, and this folder's mod.info declares\n        |                  versionMin. See "Build 42 layout" below.`
      : "",
    versionFolder: versionFolder ?? "",
    versionFolderPath: versionFolder ? `${versionFolder}/` : "",
    versionMin: getVersionMin(input.buildTarget),
    layoutNotes:
      input.buildTarget === "b42"
        ? "This project targets Build 42, which requires the version folder shown above."
        : "This project targets Build 41, where `media/` sits directly at the mod root.",
    projectFolderName: path.basename(input.projectRoot),
    createdAt: new Date().toISOString().slice(0, 10),
    outputPathExample: `<home>/Zomboid/Workshop/${sanitizePathSegment(
      input.projectName,
    )}/`,
  });

  await writeTextFile(
    fileSystem,
    path.join(input.projectRoot, "README.md"),
    rendered,
  );
}

export async function scaffoldProject(
  fileSystem: FileSystemAdapter,
  input: ProjectScaffoldInput,
): Promise<ProjectConfig> {
  await ensureDirectory(fileSystem, input.projectRoot);
  await ensureDirectory(
    fileSystem,
    resolveModsRoot(input.projectRoot, input.buildTarget),
  );

  const workshopTemplate = await loadTemplate(
    input.templateRoot,
    "workshop.txt.tpl",
  );
  const workshopContent = renderTemplate(workshopTemplate, {
    workshopTitle: input.workshopTitle,
    descriptionLines: buildWorkshopDescriptionLines(input.description),
    buildTag: input.buildTarget === "b42" ? "Build 42" : "Build 41",
  });

  await writeTextFile(
    fileSystem,
    path.join(input.projectRoot, "workshop.txt"),
    workshopContent,
  );
  await writeProjectReadme(fileSystem, input);
  await fileSystem.writeFile(
    path.join(input.projectRoot, "preview.png"),
    PLACEHOLDER_PNG_BYTES,
  );
  await scaffoldMod(fileSystem, {
    projectRoot: input.projectRoot,
    templateRoot: input.templateRoot,
    buildTarget: input.buildTarget,
    mod: input.firstMod,
  });

  const projectConfig = createProjectConfig({
    projectName: input.projectName,
    workshopTitle: input.workshopTitle,
    description: input.description,
    author: input.author,
    buildTarget: input.buildTarget,
    firstMod: input.firstMod,
  });

  await writeJsonFile(
    fileSystem,
    resolveProjectFilePath(input.projectRoot),
    projectConfig,
  );
  return projectConfig;
}

export function buildModRenamePlan(
  projectRoot: string,
  buildTarget: BuildTarget,
  oldModId: string,
  newModId: string,
): RenamePathPair[] {
  const newModRoot = resolveModRoot(projectRoot, buildTarget, newModId);
  const versionFolder = getContentVersionFolder(buildTarget);
  const newContentRoot = versionFolder
    ? path.join(newModRoot, versionFolder)
    : newModRoot;

  return [
    {
      from: resolveModRoot(projectRoot, buildTarget, oldModId),
      to: newModRoot,
    },
    // Resolved against the *new* roots because the plan executes in order and
    // step 0 has already moved the mod folder.
    ...LUA_SCOPES.map((scope) => ({
      from: path.join(newContentRoot, "media", "lua", scope, oldModId),
      to: path.join(newContentRoot, "media", "lua", scope, newModId),
    })),
  ];
}

/** True when two names differ only by letter casing. */
export function isCaseOnlyRename(from: string, to: string): boolean {
  return from !== to && from.toLowerCase() === to.toLowerCase();
}

/**
 * Renames a path safely on case-insensitive filesystems (win32, macOS), where
 * a direct case-only rename is either a no-op or fails as "already exists".
 * Staging through a temporary name in the same parent makes it a real rename
 * on every platform.
 */
export async function renamePathSafely(
  fileSystem: FileSystemAdapter,
  from: string,
  to: string,
): Promise<void> {
  await ensureDirectory(fileSystem, path.dirname(to));

  const fromName = path.basename(from);
  const toName = path.basename(to);

  if (isCaseOnlyRename(fromName, toName)) {
    const staging = path.join(
      path.dirname(from),
      `${fromName}.pzmc-${process.pid}-${Date.now()}`,
    );
    await fileSystem.rename(from, staging);
    await fileSystem.rename(staging, to);
    return;
  }

  await fileSystem.rename(from, to);
}

/**
 * Executes a rename plan in order, skipping steps whose source is absent
 * (a mod may not have every lua scope folder populated).
 */
export async function executeModRenamePlan(
  fileSystem: FileSystemAdapter,
  plan: RenamePathPair[],
): Promise<void> {
  for (const pair of plan) {
    try {
      await fileSystem.stat(pair.from);
    } catch {
      continue;
    }

    await renamePathSafely(fileSystem, pair.from, pair.to);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches a mod ID inside a file name only at a token boundary, so renaming
 * `Core` rewrites `Core_Server.lua` but leaves `CoreUtils.lua` alone.
 */
function buildModIdFileMatcher(modId: string): RegExp {
  return new RegExp(`(^|[_.\\-])${escapeRegExp(modId)}($|[_.\\-])`);
}

/**
 * Renames files whose names embed the old mod ID, e.g.
 * `MyMod_Server.lua` -> `MyNewMod_Server.lua`. Directory renames are handled
 * separately by the rename plan.
 */
export async function renameModScopedFiles(
  fileSystem: FileSystemAdapter,
  directory: string,
  oldModId: string,
  newModId: string,
): Promise<string[]> {
  let entries;
  try {
    entries = await fileSystem.readDirectory(directory);
  } catch {
    return [];
  }

  const matcher = buildModIdFileMatcher(oldModId);
  const renamed: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.kind === "directory") {
      renamed.push(
        ...(await renameModScopedFiles(
          fileSystem,
          entryPath,
          oldModId,
          newModId,
        )),
      );
      continue;
    }

    if (!matcher.test(entry.name)) {
      continue;
    }

    const newName = entry.name.split(oldModId).join(newModId);
    if (newName === entry.name) {
      continue;
    }

    const target = path.join(directory, newName);
    await renamePathSafely(fileSystem, entryPath, target);
    renamed.push(target);
  }

  return renamed;
}

/**
 * Builds the patterns rewritten inside source files during a rename. These are
 * deliberately narrow: a bare find/replace of the mod ID would also corrupt
 * unrelated strings, display text, and comments that happen to contain it.
 */
function buildContentReplacements(
  oldModId: string,
  newModId: string,
): { pattern: RegExp; replacement: string }[] {
  const id = escapeRegExp(oldModId);

  return [
    // require("OldId/...") and require "OldId/..."
    {
      pattern: new RegExp(`(require\\s*\\(?\\s*["'])${id}(/)`, "g"),
      replacement: `$1${newModId}$2`,
    },
    // Module file name inside a require path: require("New/OldId_Shared")
    {
      pattern: new RegExp(`(["'][^"']*/)${id}(_[A-Za-z0-9]+["'])`, "g"),
      replacement: `$1${newModId}$2`,
    },
    // MOD_ID = "OldId"
    {
      pattern: new RegExp(`(MOD_ID\\s*=\\s*["'])${id}(["'])`, "g"),
      replacement: `$1${newModId}$2`,
    },
    // sendClientCommand / sendServerCommand module argument
    {
      pattern: new RegExp(
        `(send(?:Client|Server)Command\\s*\\([^)]*?["'])${id}(["'])`,
        "g",
      ),
      replacement: `$1${newModId}$2`,
    },
    // ModData keys namespaced by mod ID: ModData.get("OldId")
    {
      pattern: new RegExp(`(ModData\\.\\w+\\s*\\(\\s*["'])${id}(["'])`, "g"),
      replacement: `$1${newModId}$2`,
    },
  ];
}

/**
 * Rewrites references to the old mod ID inside source files under `directory`.
 * Only well-known patterns are replaced - see buildContentReplacements. Users
 * should still search for the old ID after a rename.
 */
export async function rewriteModIdReferences(
  fileSystem: FileSystemAdapter,
  directory: string,
  oldModId: string,
  newModId: string,
): Promise<ContentRewriteResult[]> {
  let entries;
  try {
    entries = await fileSystem.readDirectory(directory);
  } catch {
    return [];
  }

  const replacements = buildContentReplacements(oldModId, newModId);
  const results: ContentRewriteResult[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.kind === "directory") {
      results.push(
        ...(await rewriteModIdReferences(
          fileSystem,
          entryPath,
          oldModId,
          newModId,
        )),
      );
      continue;
    }

    if (!RENAMEABLE_CONTENT_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    let original: string;
    try {
      original = await readTextFile(fileSystem, entryPath);
    } catch {
      continue;
    }

    let updated = original;
    let count = 0;

    for (const { pattern, replacement } of replacements) {
      // The g flag makes RegExp stateful; reset before each use.
      pattern.lastIndex = 0;
      updated = updated.replace(pattern, (...args) => {
        count += 1;
        const groups = args.slice(1, -2) as string[];
        return replacement.replace(
          /\$(\d)/g,
          (_token, index: string) => groups[Number(index) - 1] ?? "",
        );
      });
    }

    if (updated !== original) {
      await writeTextFile(fileSystem, entryPath, updated);
      results.push({ filePath: entryPath, replacements: count });
    }
  }

  return results;
}

export function getSuggestedProjectFolder(projectName: string): string {
  return sanitizePathSegment(projectName);
}
