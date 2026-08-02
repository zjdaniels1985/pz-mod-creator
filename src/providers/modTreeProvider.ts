import * as vscode from "vscode";

import {
  readProjectConfig,
  resolveModRoot,
  type ModDefinition,
} from "../core/project";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";

class InfoTreeItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "info";
  }
}

export class ModTreeItem extends vscode.TreeItem {
  constructor(
    projectRoot: string,
    buildTarget: "b41" | "b42",
    public readonly mod: ModDefinition,
  ) {
    super(mod.name, vscode.TreeItemCollapsibleState.None);
    this.description = mod.id;
    this.tooltip = `${mod.name}
${mod.id}`;
    this.contextValue = "mod";
    this.resourceUri = vscode.Uri.file(
      resolveModRoot(projectRoot, buildTarget, mod.id),
    );
    this.command = {
      command: "pzModCreator.updateMod",
      title: "Update Mod",
      arguments: [mod],
    };
  }
}

export class ModTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly fileSystem = createVsCodeFileSystem();

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [
        new InfoTreeItem("Open a workspace to manage Project Zomboid mods."),
      ];
    }

    try {
      const projectConfig = await readProjectConfig(
        this.fileSystem,
        workspaceFolder.uri.fsPath,
      );
      if (!projectConfig.mods.length) {
        return [new InfoTreeItem("No mods created yet.")];
      }

      return projectConfig.mods
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(
          (mod) =>
            new ModTreeItem(
              workspaceFolder.uri.fsPath,
              projectConfig.buildTarget,
              mod,
            ),
        );
    } catch {
      return [
        new InfoTreeItem("No Project Zomboid project found in this workspace."),
      ];
    }
  }
}
