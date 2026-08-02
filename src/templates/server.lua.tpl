--- {{modName}} - server entry point.
--- Loaded on the server only. Use this file for authoritative logic: spawning,
--- world state, validating requests sent from clients.
---
--- In single-player the game runs an internal server, so this file still loads.
--- That means server code with a UI call can appear to work solo and then fail
--- in multiplayer. Keep the separation strict.

local Shared = require("{{modId}}/{{modId}}_Shared")

local Server = {}

--- Fires once when the server finishes starting up.
function Server.onServerStarted()
    Shared.log("Hello from the server!")
end

--- Example of receiving a command sent by a client.
---@param module string
---@param command string
---@param player IsoPlayer
---@param args table
function Server.onClientCommand(module, command, player, args)
    if module ~= Shared.MOD_ID then
        return
    end

    if command == "ping" then
        Shared.log("Received ping from " .. tostring(player:getUsername()))
    end
end

Events.OnServerStarted.Add(Server.onServerStarted)
Events.OnClientCommand.Add(Server.onClientCommand)

return Server