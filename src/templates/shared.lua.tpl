--- {{modName}} - shared code.
--- Loaded on both the client and the server. Use this file for constants,
--- utility functions, and anything both sides need to agree on.
---
--- Never store mutable game state here expecting it to sync: each side gets
--- its own copy of this table.

local Shared = {}

Shared.MOD_ID = "{{modId}}"
Shared.MOD_NAME = "{{modName}}"
Shared.VERSION = "{{version}}"

--- Prints a prefixed message to the console (Zomboid/console.txt).
---@param message string
function Shared.log(message)
    print("[" .. Shared.MOD_ID .. "] " .. tostring(message))
end

return Shared