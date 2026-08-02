import * as nodeFs from "node:fs/promises";
import * as path from "node:path";

export type EntryKind = "file" | "directory";

export interface DirectoryEntry {
  name: string;
  kind: EntryKind;
}

export interface FileStat {
  type: EntryKind;
}

export interface DeleteOptions {
  recursive?: boolean;
  useTrash?: boolean;
}

export interface FileSystemAdapter {
  readFile(filePath: string): Promise<Uint8Array>;
  writeFile(filePath: string, content: Uint8Array): Promise<void>;
  createDirectory(directoryPath: string): Promise<void>;
  readDirectory(directoryPath: string): Promise<DirectoryEntry[]>;
  delete(targetPath: string, options?: DeleteOptions): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  stat(targetPath: string): Promise<FileStat>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}

export async function exists(
  fileSystem: FileSystemAdapter,
  targetPath: string,
): Promise<boolean> {
  try {
    await fileSystem.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(
  fileSystem: FileSystemAdapter,
  directoryPath: string,
): Promise<void> {
  if (!directoryPath) {
    return;
  }

  try {
    const stat = await fileSystem.stat(directoryPath);
    if (stat.type === "directory") {
      return;
    }
    throw new Error(`${directoryPath} exists and is not a directory.`);
  } catch {
    const parentPath = path.dirname(directoryPath);
    if (parentPath && parentPath !== directoryPath) {
      await ensureDirectory(fileSystem, parentPath);
    }

    try {
      await fileSystem.createDirectory(directoryPath);
    } catch {
      if (!(await exists(fileSystem, directoryPath))) {
        throw new Error(`Unable to create directory: ${directoryPath}`);
      }
    }
  }
}

export async function readTextFile(
  fileSystem: FileSystemAdapter,
  filePath: string,
): Promise<string> {
  return decoder.decode(await fileSystem.readFile(filePath));
}

export async function writeTextFile(
  fileSystem: FileSystemAdapter,
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDirectory(fileSystem, path.dirname(filePath));
  await fileSystem.writeFile(filePath, encoder.encode(content));
}

export async function readJsonFile<T>(
  fileSystem: FileSystemAdapter,
  filePath: string,
): Promise<T> {
  return JSON.parse(await readTextFile(fileSystem, filePath)) as T;
}

export async function writeJsonFile(
  fileSystem: FileSystemAdapter,
  filePath: string,
  value: unknown,
): Promise<void> {
  await writeTextFile(
    fileSystem,
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

export async function copyFile(
  fileSystem: FileSystemAdapter,
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  await ensureDirectory(fileSystem, path.dirname(destinationPath));
  await fileSystem.writeFile(
    destinationPath,
    await fileSystem.readFile(sourcePath),
  );
}

export async function deleteIfExists(
  fileSystem: FileSystemAdapter,
  targetPath: string,
  options?: DeleteOptions,
): Promise<void> {
  if (await exists(fileSystem, targetPath)) {
    await fileSystem.delete(targetPath, options);
  }
}

export async function walkFiles(
  fileSystem: FileSystemAdapter,
  rootPath: string,
  currentPath: string = rootPath,
): Promise<string[]> {
  const entries = await fileSystem.readDirectory(currentPath);
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.kind === "directory") {
      files.push(...(await walkFiles(fileSystem, rootPath, entryPath)));
      continue;
    }

    files.push(normalizeRelativePath(path.relative(rootPath, entryPath)));
  }

  return files.sort();
}

export class NodeFileSystemAdapter implements FileSystemAdapter {
  async readFile(filePath: string): Promise<Uint8Array> {
    return await nodeFs.readFile(filePath);
  }

  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    await nodeFs.writeFile(filePath, content);
  }

  async createDirectory(directoryPath: string): Promise<void> {
    await nodeFs.mkdir(directoryPath, { recursive: true });
  }

  async readDirectory(directoryPath: string): Promise<DirectoryEntry[]> {
    const entries = await nodeFs.readdir(directoryPath, {
      withFileTypes: true,
    });
    return entries.map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file",
    }));
  }

  async delete(targetPath: string, options?: DeleteOptions): Promise<void> {
    await nodeFs.rm(targetPath, {
      recursive: options?.recursive ?? false,
      force: true,
      maxRetries: 2,
    });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await ensureDirectory(this, path.dirname(newPath));
    await nodeFs.rename(oldPath, newPath);
  }

  async stat(targetPath: string): Promise<FileStat> {
    const stat = await nodeFs.stat(targetPath);
    return { type: stat.isDirectory() ? "directory" : "file" };
  }
}
