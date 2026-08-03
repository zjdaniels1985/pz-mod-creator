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

interface GitHubLatestReleaseInfo {
  tag_name?: string;
}

interface GitHubTreeEntry {
  path: string;
  type: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeEntry[];
}

interface DefinitionSourceRef {
  ref: string;
  refType: "release" | "branch";
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
    owner: "PZ-Umbrella",
    repo: "Umbrella",
    targetDirectoryName: "umbrella",
  },
];

const MAX_PARALLEL_DOWNLOADS = 8;

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

async function tryGetLatestReleaseTag(
  fetchImpl: typeof fetch,
  source: DefinitionSource,
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${source.owner}/${source.repo}/releases/latest`,
      { headers: getHeaders() },
    );
    if (!response.ok) {
      return undefined;
    }

    const release = (await response.json()) as GitHubLatestReleaseInfo;
    const tagName = release.tag_name?.trim();
    return tagName ? tagName : undefined;
  } catch {
    return undefined;
  }
}

async function getSourceRef(
  fetchImpl: typeof fetch,
  source: DefinitionSource,
): Promise<DefinitionSourceRef> {
  const latestReleaseTag = await tryGetLatestReleaseTag(fetchImpl, source);
  if (latestReleaseTag) {
    return {
      ref: latestReleaseTag,
      refType: "release",
    };
  }

  return {
    ref: await getDefaultBranch(fetchImpl, source),
    refType: "branch",
  };
}

async function getLuaFiles(
  fetchImpl: typeof fetch,
  source: DefinitionSource,
  ref: string,
): Promise<string[]> {
  const tree = await fetchJson<GitHubTreeResponse>(
    fetchImpl,
    `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${ref}?recursive=1`,
  );
  return tree.tree
    .filter(
      (entry) =>
        entry.type === "blob" && entry.path.toLowerCase().endsWith(".lua"),
    )
    .map((entry) => entry.path)
    .sort();
}

async function downloadLuaFiles(
  fileSystem: FileSystemAdapter,
  targetDirectory: string,
  source: DefinitionSource,
  sourceRef: DefinitionSourceRef,
  files: string[],
  fetchImpl: typeof fetch,
): Promise<number> {
  if (files.length === 0) {
    return 0;
  }

  let nextIndex = 0;
  const workerCount = Math.min(MAX_PARALLEL_DOWNLOADS, files.length);

  async function worker(): Promise<number> {
    let downloaded = 0;
    while (nextIndex < files.length) {
      const fileIndex = nextIndex;
      nextIndex += 1;

      const relativeFilePath = files[fileIndex];
      if (!relativeFilePath) {
        continue;
      }

      const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${sourceRef.ref}/${relativeFilePath}`;
      const content = await fetchText(fetchImpl, rawUrl);
      await writeTextFile(
        fileSystem,
        path.join(targetDirectory, relativeFilePath),
        content,
      );
      downloaded += 1;
    }
    return downloaded;
  }

  const workerResults = await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );
  return workerResults.reduce((total, value) => total + value, 0);
}

/**
 * Project Zomboid globals that are not reliably covered by Umbrella stubs.
 * Declaring them here suppresses "undefined global"
 * diagnostics from the Lua language server.
 */
export const PZ_LUA_GLOBALS = [
  "Events",
  "SandboxVars",
  "getPlayer",
  "getSpecificPlayer",
  "ProceduralDistributions",
  "Perks",
];

export async function configureLuaIntellisense(
  fileSystem: FileSystemAdapter,
  projectRoot: string,
  buildTarget: BuildTarget,
): Promise<void> {
  const vscodeDirectory = path.join(projectRoot, ".vscode");
  await ensureDirectory(fileSystem, vscodeDirectory);

  const libraries = [
    "${workspaceFolder}/.types/umbrella/library",
    buildTarget === "b42"
      ? "${workspaceFolder}/Contents/mods"
      : "${workspaceFolder}/mods",
  ];

  await writeJsonFile(fileSystem, path.join(vscodeDirectory, "settings.json"), {
    "Lua.runtime.version": "Lua 5.1",
    "Lua.workspace.checkThirdParty": false,
    "Lua.workspace.library": libraries,
    "Lua.diagnostics.globals": [...PZ_LUA_GLOBALS],
  });

  await writeJsonFile(fileSystem, path.join(projectRoot, ".emmyrc.json"), {
    workspace: {
      library: [
        ".types/umbrella/library",
        buildTarget === "b42" ? "Contents/mods" : "mods",
      ],
    },
    diagnostics: {
      enable: true,
      disable: [],
      enables: ["undefined-global", "global-in-non-module"],
      globals: [...PZ_LUA_GLOBALS],
      severity: {
        "undefined-global": "warning",
        "global-in-non-module": "warning",
      },
    },
  });

  await writeJsonFile(
    fileSystem,
    path.join(vscodeDirectory, "extensions.json"),
    {
      recommendations: ["tangzx.emmylua", "simkdt.project-zomboid-scripts"],
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
      const sourceRef = await getSourceRef(fetchImpl, source);
      const files = await getLuaFiles(fetchImpl, source, sourceRef.ref);
      await deleteIfExists(fileSystem, targetDirectory, { recursive: true });
      await ensureDirectory(fileSystem, targetDirectory);

      const downloaded = await downloadLuaFiles(
        fileSystem,
        targetDirectory,
        source,
        sourceRef,
        files,
        fetchImpl,
      );

      await writeJsonFile(
        fileSystem,
        path.join(targetDirectory, "manifest.json"),
        {
          owner: source.owner,
          repo: source.repo,
          ref: sourceRef.ref,
          refType: sourceRef.refType,
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
        `Downloaded ${downloaded} Lua definition files from ${summary.source} (${sourceRef.refType}: ${sourceRef.ref}).`,
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
