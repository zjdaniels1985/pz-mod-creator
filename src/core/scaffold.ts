import { readFile as readNodeFile } from "node:fs/promises";
import * as path from "node:path";

import {
  ensureDirectory,
  type FileSystemAdapter,
  writeJsonFile,
  writeTextFile,
} from "./fs";
import {
  createProjectConfig,
  getVersionMin,
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

export async function writeModInfo(
  fileSystem: FileSystemAdapter,
  templateRoot: string,
  projectRoot: string,
  buildTarget: BuildTarget,
  mod: ModDefinition,
): Promise<void> {
  const template = await loadTemplate(templateRoot, "mod.info.tpl");
  const rendered = renderTemplate(template, {
    name: mod.name,
    modId: mod.id,
    description: mod.description,
    author: mod.author,
    version: mod.version,
    versionMin: getVersionMin(buildTarget),
    requires: mod.requires.join(","),
  });

  await writeTextFile(
    fileSystem,
    path.join(resolveModRoot(projectRoot, buildTarget, mod.id), "mod.info"),
    rendered,
  );
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
  const luaRoot = path.join(modRoot, "media", "lua");

  await ensureDirectory(
    fileSystem,
    resolveModsRoot(input.projectRoot, input.buildTarget),
  );
  await ensureDirectory(fileSystem, path.join(luaRoot, "client", input.mod.id));
  await ensureDirectory(fileSystem, path.join(luaRoot, "server", input.mod.id));
  await ensureDirectory(fileSystem, path.join(luaRoot, "shared", input.mod.id));
  await ensureDirectory(fileSystem, path.join(modRoot, "media", "textures"));
  await ensureDirectory(fileSystem, path.join(modRoot, "media", "scripts"));
  await ensureDirectory(
    fileSystem,
    resolveTranslationRoot(input.projectRoot, input.buildTarget, input.mod.id),
  );

  await writeModInfo(
    fileSystem,
    input.templateRoot,
    input.projectRoot,
    input.buildTarget,
    input.mod,
  );
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

export async function scaffoldProject(
  fileSystem: FileSystemAdapter,
  input: ProjectScaffoldInput,
): Promise<ProjectConfig> {
  await ensureDirectory(fileSystem, input.projectRoot);
  await ensureDirectory(
    fileSystem,
    input.buildTarget === "b42"
      ? path.join(input.projectRoot, "Contents", "mods")
      : path.join(input.projectRoot, "mods"),
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
  return [
    {
      from: resolveModRoot(projectRoot, buildTarget, oldModId),
      to: newModRoot,
    },
    ...(["client", "server", "shared"] as const).map((scope) => ({
      from: path.join(newModRoot, "media", "lua", scope, oldModId),
      to: path.join(newModRoot, "media", "lua", scope, newModId),
    })),
  ];
}

export function getSuggestedProjectFolder(projectName: string): string {
  return sanitizePathSegment(projectName);
}
