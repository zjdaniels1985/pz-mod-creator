# Changelog

## 0.2.0

- Switched Lua definition downloads from Candle and PZEventDoc to Umbrella.
- Definition updates now prefer Umbrella's latest GitHub release and fall back to the default branch when needed.
- Updated generated Lua extension recommendations to `tangzx.emmylua` and `simkdt.project-zomboid-scripts`.
- Added automatic `.emmyrc.json` generation for new projects with Umbrella library paths.
- Improved project creation responsiveness by downloading Lua definitions in a background progress task.
- Sped up Lua definition updates using concurrent file downloads.
- Updated project templates and README documentation for the new IntelliSense stack.
- Added test coverage for `.emmyrc.json` generation.

## 0.1.0

- Initial release of Project Zomboid Mod Creator.
- Added project and mod scaffolding commands.
- Added translation management, build, clean, and watch workflows.
- Added Lua IntelliSense integration with Umbrella downloads.
