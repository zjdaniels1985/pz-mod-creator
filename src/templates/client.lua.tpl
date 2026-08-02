--- {{modName}} - client entry point.
--- Loaded on the client only. Use this file for UI, rendering, input handling,
--- and anything that touches the local player's screen.
---
--- Do not put authoritative game state here: clients can be modified by users,
--- so anything that must be trusted belongs in the server file.

local Shared = require("{{modId}}/{{modId}}_Shared")

local Client = {}

--- Fires once when the player finishes loading into the world.
function Client.onGameStart()
    Shared.log("Hello from the client!")
end

--- Fires every in-game hour. Handy for periodic checks.
---@param hour number
function Client.onEveryHours(hour)
    -- Shared.log("Client tick at hour " .. tostring(hour))
end

Events.OnGameStart.Add(Client.onGameStart)
Events.EveryHours.Add(Client.onEveryHours)

return Client