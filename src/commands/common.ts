import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { exists } from "../core/fs";
import {
  DEFAULT_IGNORE_GLOBS,
  readProjectConfig,
  resolveConfiguredOutputDirectory,
  resolveOutputProjectRoot,
  type BuildTarget,
  type ModDefinition,
  type ProjectConfig,
} from "../core/project";
import type { ModTreeProvider } from "../providers/modTreeProvider";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";

export interface WatchControllerLike extends vscode.Disposable {
  toggle(project: LoadedProject, services: CommandServices): Promise<void>;
}

export interface CommandServices {
  context: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  treeProvider: ModTreeProvider;
  watchController: WatchControllerLike;
}

export interface LoadedProject {
  rootPath: string;
  workspaceFolder: vscode.WorkspaceFolder;
  projectConfig: ProjectConfig;
}

export function logInfo(output: vscode.OutputChannel, message: string): void {
  output.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function getTemplateRoot(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, "src", "templates");
}

export function getSetting<T>(settingKey: string, defaultValue: T): T {
  return vscode.workspace
    .getConfiguration("pzModCreator")
    .get<T>(settingKey, defaultValue);
}

export function getIgnoreGlobs(): string[] {
  return getSetting<string[]>("ignoreGlobs", DEFAULT_IGNORE_GLOBS);
}

export function resolveOutputLocation(
  projectRoot: string,
  projectName: string,
): { outputDirectory: string; outputRoot: string } {
  const configuredDirectory = getSetting<string>("outputDirectory", "");
  const outputDirectory = resolveConfiguredOutputDirectory(
    configuredDirectory,
    os.homedir(),
    projectRoot,
  );
  return {
    outputDirectory,
    outputRoot: resolveOutputProjectRoot(outputDirectory, projectName),
  };
}

export async function tryLoadProject(): Promise<LoadedProject | undefined> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }

  const projectConfig = await readProjectConfig(
    createVsCodeFileSystem(),
    workspaceFolder.uri.fsPath,
  );
  return {
    rootPath: workspaceFolder.uri.fsPath,
    workspaceFolder,
    projectConfig,
  };
}

export async function requireCurrentProject(): Promise<LoadedProject> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error(
      "Open a workspace folder that contains a .pzmodcreator.json project file.",
    );
  }

  return {
    rootPath: workspaceFolder.uri.fsPath,
    workspaceFolder,
    projectConfig: await readProjectConfig(
      createVsCodeFileSystem(),
      workspaceFolder.uri.fsPath,
    ),
  };
}

export async function confirmDestructive(
  action: string,
  detail: string,
): Promise<boolean> {
  const selection = await vscode.window.showWarningMessage(
    action,
    { modal: true, detail },
    "Continue",
  );
  return selection === "Continue";
}

export async function selectBuildTarget(
  defaultTarget: BuildTarget,
): Promise<BuildTarget | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: "Build 42", value: "b42" as const },
      { label: "Build 41", value: "b41" as const },
    ],
    {
      title: "Select Build Target",
      placeHolder: defaultTarget === "b42" ? "Build 42" : "Build 41",
    },
  );

  return choice?.value;
}

export async function promptForModId(
  initialValue: string,
): Promise<string | undefined> {
  return await vscode.window.showInputBox({
    title: "Mod ID",
    prompt: "Enter a unique mod ID.",
    value: initialValue,
    validateInput(value) {
      if (!value.trim()) {
        return "Mod ID is required.";
      }
      if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
        return "Use only letters, numbers, underscore, period, and hyphen.";
      }
      if (value.includes(" ")) {
        return "Mod ID cannot contain spaces.";
      }
      return undefined;
    },
  });
}

export async function pickMod(
  projectConfig: ProjectConfig,
  preferred?: string | ModDefinition,
): Promise<ModDefinition | undefined> {
  const preferredId = typeof preferred === "string" ? preferred : preferred?.id;
  if (preferredId) {
    const match = projectConfig.mods.find((mod) => mod.id === preferredId);
    if (match) {
      return match;
    }
  }

  if (!projectConfig.mods.length) {
    return undefined;
  }

  if (projectConfig.mods.length === 1) {
    return projectConfig.mods[0];
  }

  const selection = await vscode.window.showQuickPick(
    projectConfig.mods.map((mod) => ({
      label: mod.name,
      description: mod.id,
      detail: mod.description,
      mod,
    })),
    {
      title: "Select Mod",
    },
  );

  return selection?.mod;
}

export async function ensureProjectFolderAvailable(
  projectRoot: string,
): Promise<void> {
  const fileSystem = createVsCodeFileSystem();
  if (!(await exists(fileSystem, projectRoot))) {
    return;
  }

  const entries = await fileSystem.readDirectory(projectRoot);
  if (entries.length > 0) {
    throw new Error(
      `The target folder already exists and is not empty: ${projectRoot}`,
    );
  }
}
