import * as path from "node:path";

import {
  type FileSystemAdapter,
  ensureDirectory,
  exists,
  readTextFile,
  writeTextFile,
} from "./fs";

export const OFFICIAL_LANGUAGES = [
  "AR",
  "CA",
  "CH",
  "CN",
  "CS",
  "DA",
  "DE",
  "EN",
  "ES",
  "FI",
  "FR",
  "HU",
  "ID",
  "IT",
  "JP",
  "KO",
  "NL",
  "NO",
  "PH",
  "PL",
  "PT",
  "PTBR",
  "RO",
  "RU",
  "TH",
  "TR",
  "UA",
] as const;

export type LanguageCode = (typeof OFFICIAL_LANGUAGES)[number];

export const TRANSLATION_PREFIXES = [
  "IG_UI",
  "UI",
  "ItemName",
  "Recipe",
  "Tooltip",
] as const;

type TranslationPrefix = (typeof TRANSLATION_PREFIXES)[number];

export interface TranslationOperationResult {
  created: string[];
  overwritten: string[];
  skipped: string[];
}

export function createTranslationContent(
  prefix: TranslationPrefix,
  languageCode: string,
): string {
  return `${prefix}_${languageCode} = {
}
`;
}

export function rewriteTranslationHeaders(
  content: string,
  targetLanguageCode: string,
): string {
  return content.replace(
    /^([A-Za-z0-9_]+)_([A-Z]+)(\s*=\s*\{)/m,
    (_match, prefix: string, _sourceLanguage: string, suffix: string) =>
      `${prefix}_${targetLanguageCode}${suffix}`,
  );
}

export function getTranslationFilePath(
  translationRoot: string,
  prefix: TranslationPrefix,
  languageCode: string,
): string {
  return path.join(
    translationRoot,
    languageCode,
    `${prefix}_${languageCode}.txt`,
  );
}

export async function listExistingLanguages(
  fileSystem: FileSystemAdapter,
  translationRoot: string,
): Promise<string[]> {
  if (!(await exists(fileSystem, translationRoot))) {
    return [];
  }

  const entries = await fileSystem.readDirectory(translationRoot);
  return entries
    .filter(
      (entry) =>
        entry.kind === "directory" &&
        OFFICIAL_LANGUAGES.includes(entry.name as LanguageCode),
    )
    .map((entry) => entry.name)
    .sort();
}

export async function addTranslationLanguage(
  fileSystem: FileSystemAdapter,
  translationRoot: string,
  languageCode: string,
  overwrite: boolean,
): Promise<TranslationOperationResult> {
  const result: TranslationOperationResult = {
    created: [],
    overwritten: [],
    skipped: [],
  };
  await ensureDirectory(fileSystem, path.join(translationRoot, languageCode));

  for (const prefix of TRANSLATION_PREFIXES) {
    const filePath = getTranslationFilePath(
      translationRoot,
      prefix,
      languageCode,
    );
    const alreadyExists = await exists(fileSystem, filePath);
    if (alreadyExists && !overwrite) {
      result.skipped.push(filePath);
      continue;
    }

    await writeTextFile(
      fileSystem,
      filePath,
      createTranslationContent(prefix, languageCode),
    );
    if (alreadyExists) {
      result.overwritten.push(filePath);
    } else {
      result.created.push(filePath);
    }
  }

  return result;
}

export async function copyTranslationLanguage(
  fileSystem: FileSystemAdapter,
  translationRoot: string,
  sourceLanguageCode: string,
  targetLanguageCode: string,
  overwrite: boolean,
): Promise<TranslationOperationResult> {
  const result: TranslationOperationResult = {
    created: [],
    overwritten: [],
    skipped: [],
  };
  const sourceDirectory = path.join(translationRoot, sourceLanguageCode);
  if (!(await exists(fileSystem, sourceDirectory))) {
    throw new Error(
      `Source translation language does not exist: ${sourceLanguageCode}`,
    );
  }

  await ensureDirectory(
    fileSystem,
    path.join(translationRoot, targetLanguageCode),
  );

  for (const prefix of TRANSLATION_PREFIXES) {
    const sourceFilePath = getTranslationFilePath(
      translationRoot,
      prefix,
      sourceLanguageCode,
    );
    const targetFilePath = getTranslationFilePath(
      translationRoot,
      prefix,
      targetLanguageCode,
    );
    const targetExists = await exists(fileSystem, targetFilePath);
    if (targetExists && !overwrite) {
      result.skipped.push(targetFilePath);
      continue;
    }

    const sourceContent = await readTextFile(fileSystem, sourceFilePath);
    const targetContent = rewriteTranslationHeaders(
      sourceContent,
      targetLanguageCode,
    );
    await writeTextFile(fileSystem, targetFilePath, targetContent);

    if (targetExists) {
      result.overwritten.push(targetFilePath);
    } else {
      result.created.push(targetFilePath);
    }
  }

  return result;
}
