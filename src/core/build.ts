import * as path from "node:path";

import { minimatch } from "minimatch";

import {
  copyFile,
  deleteIfExists,
  exists,
  normalizeRelativePath,
  type FileSystemAdapter,
  walkFiles,
} from "./fs";
import { isPathInside } from "./project";

export interface BuildResult {
  outputRoot: string;
  copiedFiles: number;
  skippedFiles: number;
  deletedOutput: boolean;
}

export interface PendingChange {
  type: "create" | "change" | "delete";
  absolutePath: string;
}

export interface BuildOptions {
  outputRoot: string;
  ignoreGlobs: string[];
  cleanBeforeBuild: boolean;
  logger?: (message: string) => void;
}

export interface DebounceScheduler<T> {
  enqueue(item: T): void;
  flush(): Promise<void>;
  dispose(): void;
}

function normalize(value: string): string {
  return normalizeRelativePath(value);
}

export function shouldIgnoreRelativePath(
  relativePath: string,
  ignoreGlobs: string[],
): boolean {
  const normalized = normalize(relativePath);
  return ignoreGlobs.some((pattern) => {
    const baseMatch = minimatch(normalized, pattern, { dot: true });
    const nestedMatch = minimatch(normalized, pattern.replace(/^\*\*\//, ""), {
      dot: true,
    });
    return baseMatch || nestedMatch;
  });
}

export async function buildProject(
  fileSystem: FileSystemAdapter,
  projectRoot: string,
  options: BuildOptions,
): Promise<BuildResult> {
  if (!isPathInside(path.dirname(options.outputRoot), options.outputRoot)) {
    throw new Error(`Unsafe output path: ${options.outputRoot}`);
  }

  let deletedOutput = false;
  if (
    options.cleanBeforeBuild &&
    (await exists(fileSystem, options.outputRoot))
  ) {
    await fileSystem.delete(options.outputRoot, { recursive: true });
    deletedOutput = true;
  }

  const effectiveIgnores = [...options.ignoreGlobs];
  if (isPathInside(projectRoot, options.outputRoot)) {
    effectiveIgnores.push(
      `${normalize(path.relative(projectRoot, options.outputRoot))}/**`,
    );
  }

  const files = await walkFiles(fileSystem, projectRoot);
  let copiedFiles = 0;
  let skippedFiles = 0;

  for (const relativePath of files) {
    if (shouldIgnoreRelativePath(relativePath, effectiveIgnores)) {
      skippedFiles += 1;
      continue;
    }

    const sourcePath = path.join(projectRoot, relativePath);
    const destinationPath = path.join(options.outputRoot, relativePath);
    await copyFile(fileSystem, sourcePath, destinationPath);
    copiedFiles += 1;
  }

  options.logger?.(
    `Build copied ${copiedFiles} files to ${options.outputRoot}.`,
  );

  return {
    outputRoot: options.outputRoot,
    copiedFiles,
    skippedFiles,
    deletedOutput,
  };
}

export async function cleanProjectOutput(
  fileSystem: FileSystemAdapter,
  outputDirectory: string,
  outputRoot: string,
): Promise<boolean> {
  if (
    !isPathInside(outputDirectory, outputRoot) ||
    path.resolve(outputDirectory) === path.resolve(outputRoot)
  ) {
    throw new Error(
      "Refusing to delete outside the configured output directory.",
    );
  }

  if (!(await exists(fileSystem, outputRoot))) {
    return false;
  }

  await fileSystem.delete(outputRoot, { recursive: true });
  return true;
}

export async function syncWorkspacePath(
  fileSystem: FileSystemAdapter,
  projectRoot: string,
  outputRoot: string,
  absolutePath: string,
  ignoreGlobs: string[],
): Promise<"copied" | "deleted" | "ignored"> {
  const relativePath = normalize(path.relative(projectRoot, absolutePath));
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return "ignored";
  }

  const outputPath = path.join(outputRoot, relativePath);
  if (shouldIgnoreRelativePath(relativePath, ignoreGlobs)) {
    await deleteIfExists(fileSystem, outputPath, { recursive: true });
    return "ignored";
  }

  if (!(await exists(fileSystem, absolutePath))) {
    await deleteIfExists(fileSystem, outputPath, { recursive: true });
    return "deleted";
  }

  const stat = await fileSystem.stat(absolutePath);
  if (stat.type === "directory") {
    return "ignored";
  }

  await copyFile(fileSystem, absolutePath, outputPath);
  return "copied";
}

export async function deleteSyncedPath(
  fileSystem: FileSystemAdapter,
  projectRoot: string,
  outputRoot: string,
  absolutePath: string,
): Promise<void> {
  const relativePath = normalize(path.relative(projectRoot, absolutePath));
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return;
  }

  await deleteIfExists(fileSystem, path.join(outputRoot, relativePath), {
    recursive: true,
  });
}

export function createDebounceScheduler<T>(
  delayMs: number,
  handler: (items: T[]) => Promise<void>,
): DebounceScheduler<T> {
  let pending: T[] = [];
  let timer: NodeJS.Timeout | undefined;
  let running = Promise.resolve();

  const runHandler = async (): Promise<void> => {
    const batch = pending;
    pending = [];
    await handler(batch);
  };

  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = undefined;
      running = running.then(runHandler).catch(() => undefined);
    }, delayMs);
  };

  return {
    enqueue(item: T) {
      pending.push(item);
      schedule();
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (!pending.length) {
        return;
      }
      await runHandler();
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
      }
      pending = [];
    },
  };
}
