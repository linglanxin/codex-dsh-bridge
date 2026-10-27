import targets from './compatibility.json' with { type: 'json' };
export const BRIDGE_VERSION = '0.2.1-rc3-windows.5';
export const SUPPORTED_DESKTOPS = targets;
export type DesktopCompatibility = (typeof SUPPORTED_DESKTOPS)[number];
// Preferred target retained for older setup clients; supportedDesktops is authoritative.
export const DESKTOP_TARGET = SUPPORTED_DESKTOPS.at(-1)!.desktop;
export const CORDIS_TARGET = SUPPORTED_DESKTOPS.at(-1)!.cordis;
export const UPSTREAM_COMMIT = SUPPORTED_DESKTOPS.at(-1)!.upstream;
