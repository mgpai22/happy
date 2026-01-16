import { MMKV } from 'react-native-mmkv';

// Separate MMKV instance for server config that persists across logouts
const serverConfigStorage = new MMKV({ id: 'server-config' });

const SERVER_KEY = 'custom-server-url';
const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com';

// Fusion/OpenCode server configuration
const FUSION_SERVER_KEY = 'fusion-server-url';
const DEFAULT_FUSION_SERVER_URL = 'http://localhost:8787';

const OPENCODE_SERVER_KEY = 'opencode-server-url';
const DEFAULT_OPENCODE_SERVER_URL = 'http://localhost:4096';

export function getServerUrl(): string {
    return serverConfigStorage.getString(SERVER_KEY) || 
           process.env.EXPO_PUBLIC_HAPPY_SERVER_URL || 
           DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(SERVER_KEY);
    }
}

export function isUsingCustomServer(): boolean {
    return getServerUrl() !== DEFAULT_SERVER_URL;
}

export function getServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getServerUrl();
    const isCustom = isUsingCustomServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        // Fallback if URL parsing fails
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }
    
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

export function getFusionServerUrl(): string {
    return serverConfigStorage.getString(FUSION_SERVER_KEY) || 
           process.env.EXPO_PUBLIC_FUSION_SERVER_URL || 
           DEFAULT_FUSION_SERVER_URL;
}

export function setFusionServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(FUSION_SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(FUSION_SERVER_KEY);
    }
}

export function isUsingCustomFusionServer(): boolean {
    return getFusionServerUrl() !== DEFAULT_FUSION_SERVER_URL;
}

export function getOpenCodeServerUrl(): string {
    return serverConfigStorage.getString(OPENCODE_SERVER_KEY) || 
           process.env.EXPO_PUBLIC_OPENCODE_SERVER_URL || 
           DEFAULT_OPENCODE_SERVER_URL;
}

export function setOpenCodeServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(OPENCODE_SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(OPENCODE_SERVER_KEY);
    }
}

export function isUsingCustomOpenCodeServer(): boolean {
    return getOpenCodeServerUrl() !== DEFAULT_OPENCODE_SERVER_URL;
}

export function getFusionServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getFusionServerUrl();
    const isCustom = isUsingCustomFusionServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}

export function getOpenCodeServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getOpenCodeServerUrl();
    const isCustom = isUsingCustomOpenCodeServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}