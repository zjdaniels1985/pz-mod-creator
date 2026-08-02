import * as path from "node:path";
import * as vscode from "vscode";

import {
  buildProject,
  createDebounceScheduler,
  deleteSyncedPath,
  syncWorkspacePath,
  type PendingChange,
} from "../core/build";
import { isPathInside } from "../core/project";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  getIgnoreGlobs,
  getSetting,
  logInfo,
  requireCurrentProject,
  resolveOutputLocation,
  type CommandServices,
  type LoadedProject,
  type WatchControllerLike,
} from "./common";

export class BuildWatchController implements WatchControllerLike {
  private readonly fileSystem = createVsCodeFileSystem();
  private readonly statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  private watcher: vscode.FileSystemWatcher | undefined;
  private scheduler:
    ReturnType<typeof createDebounceScheduler<PendingChange>> | undefined;
  private activeProjectRoot: string | undefined;
  private outputRoot: string | undefined;
  private ignoreGlobs: string[] = [];

  constructor(private readonly output: vscode.OutputChannel) {
    this.statusBarItem.command = "pzModCreator.buildAndWatch";
    this.setIdleState();
    this.statusBarItem.hide();
  }

  async toggle(
    project: LoadedProject,
    services: CommandServices,
  ): Promise<void> {
    if (this.activeProjectRoot === project.rootPath) {
      this.stop();
      vscode.window.showInformationMessage("Build and Watch stopped.");
      return;
    }

    this.stop();
    const { outputRoot } = resolveOutputLocation(
      project.rootPath,
      project.projectConfig.projectName,
    );
    this.outputRoot = outputRoot;
    this.activeProjectRoot = project.rootPath;
    this.ignoreGlobs = getIgnoreGlobs();
    if (isPathInside(project.rootPath, outputRoot)) {
      const relativeOutputRoot = path
        .relative(project.rootPath, outputRoot)
        .replace(/\\/g, "/");
      this.ignoreGlobs = [...this.ignoreGlobs, `${relativeOutputRoot}/**`];
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Starting Build and Watch",
      },
      async () => {
        this.setSyncingState();
        try {
          await buildProject(this.fileSystem, project.rootPath, {
            outputRoot,
            ignoreGlobs: this.ignoreGlobs,
            cleanBeforeBuild: getSetting<boolean>("cleanBeforeBuild", false),
            logger: (message) => logInfo(this.output, message),
          });
        } finally {
          this.setIdleState();
        }
      },
    );

    const relativePattern = new vscode.RelativePattern(
      project.workspaceFolder,
      "**/*",
    );
    this.scheduler = createDebounceScheduler(
      getSetting<number>("watchDebounce", 300),
      async (changes) => await this.processChanges(project, changes),
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(
      relativePattern,
      false,
      false,
      false,
    );
    this.watcher.onDidCreate((uri) =>
      this.scheduler?.enqueue({ type: "create", absolutePath: uri.fsPath }),
    );
    this.watcher.onDidChange((uri) =>
      this.scheduler?.enqueue({ type: "change", absolutePath: uri.fsPath }),
    );
    this.watcher.onDidDelete((uri) =>
      this.scheduler?.enqueue({ type: "delete", absolutePath: uri.fsPath }),
    );

    this.statusBarItem.show();
    logInfo(this.output, `Build and Watch started for ${project.rootPath}`);
    vscode.window.showInformationMessage(
      "Build and Watch started. Run the command again to stop it.",
    );
    services.treeProvider.refresh();
  }

  private async processChanges(
    project: LoadedProject,
    changes: PendingChange[],
  ): Promise<void> {
    if (!this.outputRoot) {
      return;
    }

    const latestByPath = new Map<string, PendingChange["type"]>();
    for (const change of changes) {
      latestByPath.set(change.absolutePath, change.type);
    }

    this.setSyncingState();
    try {
      for (const [absolutePath, type] of latestByPath) {
        if (type === "delete") {
          await deleteSyncedPath(
            this.fileSystem,
            project.rootPath,
            this.outputRoot,
            absolutePath,
          );
          continue;
        }

        await syncWorkspacePath(
          this.fileSystem,
          project.rootPath,
          this.outputRoot,
          absolutePath,
          this.ignoreGlobs,
        );
      }
    } finally {
      this.setIdleState();
    }
  }

  private setSyncingState(): void {
    this.statusBarItem.text = "$(sync~spin) PZ Watch: syncing";
    this.statusBarItem.tooltip = "Project Zomboid build output is syncing";
    this.statusBarItem.show();
  }

  private setIdleState(): void {
    this.statusBarItem.text = "$(eye) PZ Watch: watching";
    this.statusBarItem.tooltip = "Project Zomboid build watch is active";
  }

  stop(): void {
    this.scheduler?.dispose();
    this.scheduler = undefined;
    this.watcher?.dispose();
    this.watcher = undefined;
    this.activeProjectRoot = undefined;
    this.outputRoot = undefined;
    this.statusBarItem.hide();
  }

  dispose(): void {
    this.stop();
    this.statusBarItem.dispose();
  }
}

export function registerBuildAndWatchCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "pzModCreator.buildAndWatch",
    async () => {
      const project = await requireCurrentProject();
      await services.watchController.toggle(project, services);
    },
  );
}
