import * as path from "node:path";

import {
  deleteIfExists,
  ensureDirectory,
  type FileSystemAdapter,
  writeJsonFile,
  writeTextFile,
} from "./fs";
import { type BuildTarget } from "./project";

interface DefinitionSource {
  owner: string;
  repo: string;
  targetDirectoryName: string;
}

interface GitHubRepositoryInfo {
  default_branch?: string;
}

interface GitHubTreeEntry {
  path: string;
  type: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeEntry[];
}

export interface DefinitionDownloadSummary {
  source: string;
  filesDownloaded: number;
  failed?: string;
}

export interface DefinitionDownloadResult {
  summaries: DefinitionDownloadSummary[];
  failures: string[];
}

const DEFINITION_SOURCES: DefinitionSource[] = [
  {
    owner: "asledgehammer",
    repo: "Candle",
    targetDirectoryName: "candle",
  },
  {
    owner: "demiurgeQuantified",
    repo: "PZEventDoc",
    targetDirectoryName: "pzeventdoc",
  },
];

function getHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "pz-mod-creator",
  };
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url, { headers: getHeaders() });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  return (await response.json()) as T;
}

async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
): Promise<string> {
  const response = await fetchImpl(url, { headers: getHeaders() });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  return await response.text();
}

async function getDefaultBranch(
  fetchImpl: typeof fetch,
  source: DefinitionSource,
): Promise<string> {
  const metadata = await fetchJson<GitHubRepositoryInfo>(
    fetchImpl,
    `https://api.github.com/repos/${source.owner}/${source.repo}`,
  );
  return metadata.default_branch ?? "main";
}

async function getLuaFiles(
  fetchImpl: typeof fetch,
  source: DefinitionSource,
  branch: string,
): Promise<string[]> {
  const tree = await fetchJson<GitHubTreeResponse>(
    fetchImpl,
    `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${branch}?recursive=1`,
  );
  return tree.tree
    .filter(
      (entry) =>
        entry.type === "blob" && entry.path.toLowerCase().endsWith(".lua"),
    )
    .map((entry) => entry.path)
    .sort();
}

export async function configureLuaIntellisense(
  fileSystem: FileSystemAdapter,
  projectRoot: string,
  buildTarget: BuildTarget,
): Promise<void> {
  const vscodeDirectory = path.join(projectRoot, ".vscode");
  await ensureDirectory(fileSystem, vscodeDirectory);

  const libraries = [
    "${workspaceFolder}/.types/candle",
    "${workspaceFolder}/.types/pzeventdoc",
    buildTarget === "b42"
      ? "${workspaceFolder}/Contents/mods"
      : "${workspaceFolder}/mods",
  ];

  await writeJsonFile(fileSystem, path.join(vscodeDirectory, "settings.json"), {
    "Lua.runtime.version": "Lua 5.1",
    "Lua.workspace.checkThirdParty": false,
    "Lua.workspace.library": libraries,
    "Lua.diagnostics.globals": [
      "Events",
      "SandboxVars",
      "getPlayer",
      "getSpecificPlayer",
    ],
  });

  await writeJsonFile(
    fileSystem,
    path.join(vscodeDirectory, "extensions.json"),
    {
      recommendations: ["sumneko.lua"],
    },
  );
}

export async function updateLuaDefinitions(
  fileSystem: FileSystemAdapter,
  projectRoot: string,
  logger?: (message: string) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<DefinitionDownloadResult> {
  const summaries: DefinitionDownloadSummary[] = [];
  const failures: string[] = [];
  const typeRoot = path.join(projectRoot, ".types");
  await ensureDirectory(fileSystem, typeRoot);

  for (const source of DEFINITION_SOURCES) {
    const targetDirectory = path.join(typeRoot, source.targetDirectoryName);
    try {
      const branch = await getDefaultBranch(fetchImpl, source);
      const files = await getLuaFiles(fetchImpl, source, branch);
      await deleteIfExists(fileSystem, targetDirectory, { recursive: true });
      await ensureDirectory(fileSystem, targetDirectory);

      let downloaded = 0;
      for (const relativeFilePath of files) {
        const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${branch}/${relativeFilePath}`;
        const content = await fetchText(fetchImpl, rawUrl);
        await writeTextFile(
          fileSystem,
          path.join(targetDirectory, relativeFilePath),
          content,
        );
        downloaded += 1;
      }

      await writeJsonFile(
        fileSystem,
        path.join(targetDirectory, "manifest.json"),
        {
          owner: source.owner,
          repo: source.repo,
          branch,
          filesDownloaded: downloaded,
          fetchedAt: new Date().toISOString(),
        },
      );

      const summary = {
        source: `${source.owner}/${source.repo}`,
        filesDownloaded: downloaded,
      } satisfies DefinitionDownloadSummary;
      summaries.push(summary);
      logger?.(
        `Downloaded ${downloaded} Lua definition files from ${summary.source}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summaries.push({
        source: `${source.owner}/${source.repo}`,
        filesDownloaded: 0,
        failed: message,
      });
      failures.push(`${source.owner}/${source.repo}: ${message}`);
      logger?.(`Failed to update ${source.owner}/${source.repo}: ${message}`);
    }
  }

  return { summaries, failures };
}
