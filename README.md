# Project Zomboid Mod Creator

Project Zomboid Mod Creator is a VS Code extension for scaffolding, maintaining, and building Project Zomboid workshop projects for Build 41 and Build 42 layouts.

## Recommended Extensions

This repository uses VS Code Workspace Recommendations to set up the development environment.

### Essential Extensions
* **EmmyLua** (`tangzx.emmylua`) - **Required** for Lua autocomplete, type checking, and code intelligence.

### Optional Extensions
* **Project Zomboid Scripts** (`SimKDT.project-zomboid-scripts`) - Highly recommended for specialized script syntax and automation.

### How to Install
1. Open the **Extensions** view in VS Code (`Ctrl+Shift+X` or `Cmd+Shift+X`).
2. Search for `@recommended` in the search bar.
3. Install the extensions listed under the **Workspace Recommendations** section.

## Features

- Create new Project Zomboid workshop projects with the correct folder structure.
- Manage multiple mods in one project from the **PZ Mods** explorer tree.
- Update mod metadata, rename mod IDs, or delete mods with confirmation prompts.
- Add or copy official translation language files.
- Build projects into your local Workshop output directory and keep them synced with **Build and Watch**.
- Configure Lua IntelliSense and download Umbrella definitions.

## Commands

| Command                                     | Description                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PZ Mod Creator: New Project`               | Create a new workshop project, scaffold the first mod, and configure IntelliSense. |
| `PZ Mod Creator: Create Mod`                | Add a new mod to the current project.                                              |
| `PZ Mod Creator: Update Mod`                | Edit mod metadata and rewrite `mod.info`.                                          |
| `PZ Mod Creator: Delete Mod`                | Remove a mod directory and its project entry after confirmation.                   |
| `PZ Mod Creator: Rename Mod`                | Rename a mod ID, its folder, and nested Lua folders.                               |
| `PZ Mod Creator: Add Translation Language`  | Create the five standard translation files for an official language.               |
| `PZ Mod Creator: Copy Translation Language` | Copy one language to another and rewrite the table headers.                        |
| `PZ Mod Creator: Clean Output`              | Delete this extension's generated output folder for the current project.           |
| `PZ Mod Creator: Build`                     | Copy the project into the configured output directory.                             |
| `PZ Mod Creator: Build and Watch`           | Toggle continuous file sync into the output folder.                                |
| `PZ Mod Creator: Update Definitions`        | Refresh Umbrella Lua definition stubs.                                             |

## Settings

| Setting                                | Default                                            | Description                                                           |
| -------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| `pzModCreator.outputDirectory`         | `""`                                               | Output path for builds. Empty resolves to `<home>/Zomboid/Workshop/`. |
| `pzModCreator.buildTarget`             | `b42`                                              | Default project build target for new projects.                        |
| `pzModCreator.watchDebounce`           | `300`                                              | Debounce delay for Build and Watch.                                   |
| `pzModCreator.cleanBeforeBuild`        | `false`                                            | Delete the generated output folder before each build.                 |
| `pzModCreator.ignoreGlobs`             | `[`                                                |                                                                       |
|                                        | `"**/.git/**",`                                    |                                                                       |
|                                        | `"**/node_modules/**",`                            |                                                                       |
|                                        | `"**/.pzmodcreator.json",`                         |                                                                       |
|                                        | `"**/.vscode/**",`                                 |                                                                       |
|                                        | `".types/**"`                                      |                                                                       |
|                                        | `]`                                                | Glob patterns skipped during build and watch sync.                    |
| `pzModCreator.defaultAuthor`           | `""`                                               | Suggested author name for new projects and mods.                      |
| `pzModCreator.intellisense.enabled`    | `true`                                             | Enable generated Lua workspace settings and recommendations.          |
| `pzModCreator.intellisense.autoUpdate` | `true`                                             | Refresh definition stubs automatically when a project is opened.      |

## IntelliSense configuration

When you create a new project, the extension generates both editor-level and
language-server-level Lua config files:

- `.vscode/settings.json` for VS Code Lua workspace settings.
- `.vscode/extensions.json` with recommendations for `tangzx.emmylua` and
  `simkdt.project-zomboid-scripts`.
- `.emmyrc.json` for EmmyLua analyzer configuration.

The generated `.emmyrc.json` points the EmmyLua workspace at Umbrella and your
project's mod root. For example (Build 42):

```json
{
  "workspace": {
    "library": [".types/umbrella/library", "Contents/mods"]
  },
  "diagnostics": {
    "enable": true,
    "disable": [],
    "enables": ["undefined-global", "global-in-non-module"],
    "globals": [
      "Events",
      "SandboxVars",
      "getPlayer",
      "getSpecificPlayer",
      "ProceduralDistributions",
      "Perks"
    ],
    "severity": {
      "undefined-global": "warning",
      "global-in-non-module": "warning"
    }
  }
}
```

For Build 41 projects, the second library entry is `mods` instead of
`Contents/mods`.

You can customize `.emmyrc.json` per project to add extra local libraries; the
extension only rewrites it when IntelliSense configuration runs.

`PZ Mod Creator: Update Definitions` fetches Umbrella stubs from the latest
GitHub release tag when available, and falls back to the repository default
branch if release metadata is unavailable.

## Generated project structure

```text
<project-root>/
  workshop.txt
  preview.png
  .pzmodcreator.json
  Contents/
    mods/
      <ModID>/
        mod.info
        poster.png
        media/
          lua/
            client/<ModID>/
            server/<ModID>/
            shared/<ModID>/
            shared/Translate/EN/
          textures/
          scripts/
```

Build 41 projects use `mods/<ModID>/` at the project root instead of `Contents/mods/<ModID>/`.

## Steam Workshop publishing

1. Build the project into your configured Workshop output directory.
2. Open the Project Zomboid Workshop uploader and select the generated project folder.
3. Review `workshop.txt`, poster art, preview image, and translations before publishing.
4. If you changed a mod ID, warn players because existing saves can break.

## Extension Development

```bash
npm install
npm run compile
npm test
```
