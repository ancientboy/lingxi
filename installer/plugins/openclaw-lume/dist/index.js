/**
 * Lume channel plugin entry point
 */
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { lumePlugin } from "./channel.js";
export default defineChannelPluginEntry({
    id: "lume",
    name: "Lume",
    description: "WebSocket bridge channel plugin for Lingxi Cloud (灵犀云)",
    plugin: lumePlugin,
});
