import * as vscode from "vscode";

import {
  addTranslationLanguage,
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

export function registerAddTranslationCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "pzModCreator.addTranslation",
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
      const choices = OFFICIAL_LANGUAGES.filter(
        (language) => !existing.includes(language),
      );
      if (!choices.length) {
        vscode.window.showInformationMessage(
          "All official languages already exist for this mod.",
        );
        return;
      }

      const selectedLanguage = await vscode.window.showQuickPick(choices, {
        title: "Add Translation Language",
      });
      if (!selectedLanguage) {
        return;
      }

      const result = await addTranslationLanguage(
        fileSystem,
        translationRoot,
        selectedLanguage as LanguageCode,
        false,
      );
      logInfo(
        services.output,
        `Created ${result.created.length} translation files for ${selectedLanguage}.`,
      );
      vscode.window.showInformationMessage(
        `Added translation language ${selectedLanguage}.`,
      );
    },
  );
}
