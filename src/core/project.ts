import * as path from "node:path";

import { type FileSystemAdapter, readJsonFile, writeJsonFile } from "./fs";

export const PROJECT_FILE_NAME = ".pzmodcreator.json";
export const DEFAULT_IGNORE_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.pzmodcreator.json",
  "**/.vscode/**",
  ".types/**",
];
export const MOD_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const WINDOWS_MAX_PATH = 260;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type BuildTarget = "b41" | "b42";

export interface ModDefinition {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  requires: string[];
}

export interface ProjectConfig {
  version: number;
  generatedBy: string;
  projectName: string;
  workshopTitle: string;
  description: string;
  author: string;
  buildTarget: BuildTarget;
  createdAt: string;
  updatedAt: string;
  mods: ModDefinition[];
}

export interface CreateProjectConfigInput {
  projectName: string;
  workshopTitle: string;
  description: string;
  author: string;
  buildTarget: BuildTarget;
  firstMod: ModDefinition;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function validateModId(modId: string): ValidationResult {
  if (!modId.trim()) {
    return { valid: false, message: "Mod ID is required." };
  }

  if (modId.includes(" ")) {
    return { valid: false, message: "Mod ID cannot contain spaces." };
  }

  if (modId.endsWith(".") || modId.endsWith(" ")) {
    return {
      valid: false,
      message: "Mod ID cannot end with a period or space.",
    };
  }

  if (!MOD_ID_PATTERN.test(modId)) {
    return {
      valid: false,
      message:
        "Only letters, numbers, underscore, period, and hyphen are allowed.",
    };
  }

  if (isWindowsReservedName(modId)) {
    return {
      valid: false,
      message:
        "Mod ID cannot be a Windows reserved device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9).",
    };
  }

  return { valid: true };
}

export function sanitizePathSegment(value: string): string {
  const strippedTrailing = value.trim().replace(/[.\s\\]+$/g, "");
  let sanitized = strippedTrailing
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) {
    sanitized = "project-zomboid-mod";
  }
  if (isWindowsReservedName(sanitized)) {
    sanitized = `${sanitized}-mod`;
  }
  return sanitized;
}

export function sanitizeModIdCandidate(value: string): string {
  let sanitized = value
    .trim()
    .replace(/[.\s\\]+$/g, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_.-]/g, "");
  if (!sanitized) {
    sanitized = "MyMod";
  }
  if (isWindowsReservedName(sanitized)) {
    sanitized = `${sanitized}Mod`;
  }
  return sanitized;
}

export function getVersionMin(buildTarget: BuildTarget): string {
  return buildTarget === "b42" ? "42.0" : "41.0";
}

/**
 * Build 42 namespaces mod content under a version folder (e.g. `42.0/media`),
 * and that folder's mod.info is the one carrying `versionMin=`. The root
 * mod.info acts as a discovery stub and must omit it. Build 41 keeps `media/`
 * directly at the mod root with no version folder.
 */
export function getContentVersionFolder(
  buildTarget: BuildTarget,
): string | undefined {
  return buildTarget === "b42" ? getVersionMin(buildTarget) : undefined;
}

export function resolveProjectFilePath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_FILE_NAME);
}

export function resolveModsRoot(
  projectRoot: string,
  buildTarget: BuildTarget,
): string {
  return buildTarget === "b42"
    ? path.join(projectRoot, "Contents", "mods")
    : path.join(projectRoot, "mods");
}

export function resolveModRoot(
  projectRoot: string,
  buildTarget: BuildTarget,
  modId: string,
): string {
  return path.join(resolveModsRoot(projectRoot, buildTarget), modId);
}

/**
 * The folder that contains `media/` for a mod. On B42 this is
 * `<modRoot>/42.0`; on B41 it is the mod root itself. Use this for anything
 * under `media/`; use resolveModRoot for `poster.png` and the root mod.info.
 */
export function resolveModContentRoot(
  projectRoot: string,
  buildTarget: BuildTarget,
  modId: string,
): string {
  const modRoot = resolveModRoot(projectRoot, buildTarget, modId);
  const versionFolder = getContentVersionFolder(buildTarget);
  return versionFolder ? path.join(modRoot, versionFolder) : modRoot;
}

export function resolveModMediaRoot(
  projectRoot: string,
  buildTarget: BuildTarget,
  modId: string,
): string {
  return path.join(
    resolveModContentRoot(projectRoot, buildTarget, modId),
    "media",
  );
}

export function resolveTranslationRoot(
  projectRoot: string,
  buildTarget: BuildTarget,
  modId: string,
): string {
  return path.join(
    resolveModMediaRoot(projectRoot, buildTarget, modId),
    "lua",
    "shared",
    "Translate",
  );
}

export function resolveConfiguredOutputDirectory(
  configuredDirectory: string | undefined,
  homeDirectory: string,
  workspaceRoot?: string,
): string {
  if (!configuredDirectory || !configuredDirectory.trim()) {
    return path.join(homeDirectory, "Zomboid", "Workshop");
  }

  const trimmedDirectory = configuredDirectory.trim();
  const expandedDirectory = trimmedDirectory
    .replace(/^~(?=$|[\\/])/, homeDirectory)
    .replace(/\$\{userHome\}/g, homeDirectory);

  if (path.isAbsolute(expandedDirectory)) {
    return path.normalize(expandedDirectory);
  }

  if (workspaceRoot) {
    return path.resolve(workspaceRoot, expandedDirectory);
  }

  return path.resolve(expandedDirectory);
}

export function resolveOutputProjectRoot(
  outputDirectory: string,
  projectName: string,
): string {
  return path.join(outputDirectory, sanitizePathSegment(projectName));
}

export function isPathInside(
  parentPath: string,
  candidatePath: string,
): boolean {
  const relative = path.relative(
    path.resolve(parentPath),
    path.resolve(candidatePath),
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function exceedsWindowsPathLimit(filePath: string): boolean {
  return path.resolve(filePath).length > WINDOWS_MAX_PATH;
}

export function pathsAreEqual(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  if (process.platform === "win32" || process.platform === "darwin") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

export function isWindowsReservedName(name: string): boolean {
  const normalized = name.trim().replace(/[.\s]+$/g, "");
  const baseName = normalized.split(".")[0];
  if (!baseName) {
    return false;
  }
  return WINDOWS_RESERVED_NAME_PATTERN.test(baseName);
}

export function createProjectConfig(
  input: CreateProjectConfigInput,
): ProjectConfig {
  const timestamp = new Date().toISOString();
  return {
    version: 1,
    generatedBy: "Project Zomboid Mod Creator",
    projectName: input.projectName,
    workshopTitle: input.workshopTitle,
    description: input.description,
    author: input.author,
    buildTarget: input.buildTarget,
    createdAt: timestamp,
    updatedAt: timestamp,
    mods: [input.firstMod],
  };
}

export async function readProjectConfig(
  fileSystem: FileSystemAdapter,
  projectRoot: string,
): Promise<ProjectConfig> {
  return await readJsonFile<ProjectConfig>(
    fileSystem,
    resolveProjectFilePath(projectRoot),
  );
}

export async function writeProjectConfig(
  fileSystem: FileSystemAdapter,
  projectRoot: string,
  projectConfig: ProjectConfig,
): Promise<void> {
  projectConfig.updatedAt = new Date().toISOString();
  await writeJsonFile(
    fileSystem,
    resolveProjectFilePath(projectRoot),
    projectConfig,
  );
}

export function findMod(
  projectConfig: ProjectConfig,
  modId: string,
): ModDefinition | undefined {
  return projectConfig.mods.find((mod) => mod.id === modId);
}

export function findModIndex(
  projectConfig: ProjectConfig,
  modId: string,
): number {
  return projectConfig.mods.findIndex((mod) => mod.id === modId);
}

export function modIdExists(
  projectConfig: ProjectConfig,
  modId: string,
  ignoreModId?: string,
): boolean {
  return projectConfig.mods.some(
    (mod) => mod.id !== ignoreModId && mod.id === modId,
  );
}
