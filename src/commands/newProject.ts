import * as path from "node:path";
import * as vscode from "vscode";

import { scaffoldProject, getSuggestedProjectFolder } from "../core/scaffold";
import { sanitizeModIdCandidate, type ModDefinition } from "../core/project";
import {
  configureLuaIntellisense,
  updateLuaDefinitions,
} from "../core/intellisense";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  ensureProjectFolderAvailable,
  getSetting,
  getTemplateRoot,
  logInfo,
  selectBuildTarget,
  type CommandServices,
  promptForModId,
} from "./common";

export function registerNewProjectCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "pzModCreator.newProject",
    async () => {
      const workshopTitle = await vscode.window.showInputBox({
        title: "New Project",
        prompt: "Workshop title",
        validateInput(value) {
          return value.trim() ? undefined : "Workshop title is required.";
        },
      });
      if (!workshopTitle) {
        return;
      }

      const author = await vscode.window.showInputBox({
        title: "New Project",
        prompt: "Author",
        value: getSetting<string>("defaultAuthor", ""),
      });
      if (author === undefined) {
        return;
      }

      const buildTarget = await selectBuildTarget(
        getSetting<"b41" | "b42">("buildTarget", "b42"),
      );
      if (!buildTarget) {
        return;
      }

      const destinationFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Parent Folder",
      });
      if (!destinationFolder?.length) {
        return;
      }

      const firstModName = await vscode.window.showInputBox({
        title: "First Mod",
        prompt: "Mod name",
        value: workshopTitle,
        validateInput(value) {
          return value.trim() ? undefined : "Mod name is required.";
        },
      });
      if (!firstModName) {
        return;
      }

      const firstModId = await promptForModId(
        sanitizeModIdCandidate(firstModName),
      );
      if (!firstModId) {
        return;
      }

      const firstModDescription =
        (await vscode.window.showInputBox({
          title: "First Mod",
          prompt: "Mod description",
          value: "",
        })) ?? "";

      const projectRoot = path.join(
        destinationFolder[0].fsPath,
        getSuggestedProjectFolder(workshopTitle),
      );
      const fileSystem = createVsCodeFileSystem();
      const firstMod: ModDefinition = {
        id: firstModId,
        name: firstModName,
        description: firstModDescription,
        author,
        version: "1.0.0",
        requires: [],
      };

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Creating Project Zomboid mod project",
        },
        async (progress) => {
          progress.report({ message: "Preparing folders" });
          await ensureProjectFolderAvailable(projectRoot);

          progress.report({ message: "Scaffolding project files" });
          await scaffoldProject(fileSystem, {
            projectRoot,
            templateRoot: getTemplateRoot(services.context),
            projectName: workshopTitle,
            workshopTitle,
            description: firstModDescription,
            author,
            buildTarget,
            firstMod,
          });

          if (getSetting<boolean>("intellisense.enabled", true)) {
            progress.report({ message: "Configuring IntelliSense" });
            await configureLuaIntellisense(
              fileSystem,
              projectRoot,
              buildTarget,
            );

            if (getSetting<boolean>("intellisense.autoUpdate", true)) {
              progress.report({
                message: "Scheduling Lua definitions download",
              });
              void vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: "Downloading Project Zomboid Lua definitions",
                },
                async () => {
                  const result = await updateLuaDefinitions(
                    fileSystem,
                    projectRoot,
                    (message) => logInfo(services.output, message),
                  );
                  if (result.failures.length) {
                    vscode.window.showWarningMessage(
                      "Project created, but one or more Lua definition sources could not be downloaded. Use “PZ Mod Creator: Update Definitions” to retry later.",
                    );
                  }
                },
              );
            }
          }
        },
      );

      logInfo(services.output, `Created project at ${projectRoot}`);
      services.treeProvider.refresh();

      const openFolderSelection = await vscode.window.showInformationMessage(
        "Project created successfully.",
        "Open Folder",
      );
      if (openFolderSelection === "Open Folder") {
        await vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(projectRoot),
          true,
        );
      }
    },
  );
}
