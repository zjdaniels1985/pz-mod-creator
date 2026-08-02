import * as path from "node:path";
import * as vscode from "vscode";

import {
  copyTranslationLanguage,
  listExistingLanguages,
  OFFICIAL_LANGUAGES,
  type LanguageCode,
} from "../core/translations";
import { resolveTranslationRoot, type ModDefinition } from "../core/project";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  logInfo,
  pickMod,
  requireCurrentProject,
  type CommandServices,
} from "./common";

export function registerCopyTranslationCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "pzModCreator.copyTranslation",
    async (selected?: string | ModDefinition) => {
      const project = await requireCurrentProject();
      const mod = await pickMod(project.projectConfig, selected);
      if (!mod) {
        vscode.window.showInformationMessage("No mod selected.");
        return;
      }

      const fileSystem = createVsCodeFileSystem();
      const translationRoot = resolveTranslationRoot(
        project.rootPath,
        project.projectConfig.buildTarget,
        mod.id,
      );
      const existing = await listExistingLanguages(fileSystem, translationRoot);
      if (!existing.length) {
        throw new Error("No source translations exist to copy from.");
      }

      const sourceLanguage = await vscode.window.showQuickPick(existing, {
        title: "Select Source Language",
      });
      if (!sourceLanguage) {
        return;
      }

      const targetLanguage = await vscode.window.showQuickPick(
        OFFICIAL_LANGUAGES.filter((language) => language !== sourceLanguage),
        {
          title: "Select Target Language",
        },
      );
      if (!targetLanguage) {
        return;
      }

      const targetPattern = path
        .join(
          path.relative(project.rootPath, translationRoot),
          targetLanguage,
          "*.txt",
        )
        .replace(/\\/g, "/");
      const existingTargetFiles = existing.includes(targetLanguage)
        ? await vscode.workspace.findFiles(
            new vscode.RelativePattern(project.workspaceFolder, targetPattern),
          )
        : [];

      let overwrite = false;
      if (existingTargetFiles.length) {
        const selection = await vscode.window.showWarningMessage(
          `Overwrite existing ${targetLanguage} translation files?`,
          { modal: true },
          "Overwrite",
        );
        overwrite = selection === "Overwrite";
        if (!overwrite) {
          return;
        }
      }

      const result = await copyTranslationLanguage(
        fileSystem,
        translationRoot,
        sourceLanguage as LanguageCode,
        targetLanguage as LanguageCode,
        overwrite,
      );
      logInfo(
        services.output,
        `Copied translations from ${sourceLanguage} to ${targetLanguage}: ${result.created.length + result.overwritten.length} files written.`,
      );
      vscode.window.showInformationMessage(
        `Copied ${sourceLanguage} translations to ${targetLanguage}.`,
      );
    },
  );
}
