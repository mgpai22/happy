import { encodeBase64 } from '@/encryption/base64';

export interface FusionSession {
    id: string;
    userId: string;
    name: string;
    status: 'pending' | 'provisioning' | 'starting' | 'active' | 'stopping' | 'stopped' | 'error';
    config: {
        repositoryUrl?: string;
        branch: string;
        serverType: string;
        location: string;
        maxRuntimeHours: number;
    };
    sandboxId?: string;
    sandboxIp?: string;
    openCodeSessionId?: string;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    stoppedAt?: string;
    error?: string;
}

export interface FusionHealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    timestamp: string;
    services: Record<string, { status: 'up' | 'down' | 'unknown'; latencyMs?: number }>;
}

export interface OpenCodeSession {
    id: string;
    slug?: string;
    version?: string;
    projectID?: string;
    directory?: string;
    title?: string;
    time?: {
        created: number;
        updated: number;
    };
    summary?: {
        additions: number;
        deletions: number;
        files: number;
    };
}

export interface OpenCodeMessagePart {
    type: 'text';
    text: string;
}

export interface FusionClientConfig {
    apiUrl: string;
    token?: string;
    openCodePassword?: string;
}

// OpenCode API endpoints
const OPENCODE_HEALTH_ENDPOINT = '/global/health';
const OPENCODE_SESSION_ENDPOINT = '/session';

/**
 * Client for interacting with Fusion API and OpenCode instances
 */
export class FusionClient {
    private apiUrl: string;
    private token?: string;
    private openCodePassword?: string;

    constructor(config: FusionClientConfig) {
        this.apiUrl = config.apiUrl;
        this.token = config.token;
        this.openCodePassword = config.openCodePassword;
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    private getOpenCodeAuthHeader(): Record<string, string> {
        if (!this.openCodePassword) return {};
        const encoder = new TextEncoder();
        const credentials = encodeBase64(encoder.encode(`opencode:${this.openCodePassword}`));
        return { Authorization: `Basic ${credentials}` };
    }

    // Fusion API methods

    async checkHealth(): Promise<FusionHealthResponse> {
        const response = await fetch(`${this.apiUrl}/health`, {
            headers: this.getHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }

        return response.json() as Promise<FusionHealthResponse>;
    }

    async isServerRunning(): Promise<boolean> {
        try {
            const health = await this.checkHealth();
            return health.status === 'healthy';
        } catch {
            return false;
        }
    }

    async createSession(name: string, config?: Partial<FusionSession['config']>): Promise<FusionSession> {
        const response = await fetch(`${this.apiUrl}/session`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ name, config }),
        });

        if (!response.ok) {
            const error = await response.json() as { error?: { message?: string } };
            throw new Error(`Failed to create session: ${error?.error?.message || response.status}`);
        }

        return response.json() as Promise<FusionSession>;
    }

    async getSession(sessionId: string): Promise<FusionSession> {
        const response = await fetch(`${this.apiUrl}/session/${sessionId}`, {
            headers: this.getHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Failed to get session: ${response.status}`);
        }

        return response.json() as Promise<FusionSession>;
    }

    async deleteSession(sessionId: string): Promise<void> {
        const response = await fetch(`${this.apiUrl}/session/${sessionId}`, {
            method: 'DELETE',
            headers: this.getHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Failed to delete session: ${response.status}`);
        }
    }

    /**
     * Wait for a Fusion session to become active (VPS provisioned and OpenCode running)
     */
    async waitForSessionReady(
        sessionId: string,
        timeoutMs = 300000,
        onStatusChange?: (status: FusionSession['status']) => void
    ): Promise<FusionSession> {
        const startTime = Date.now();
        let lastStatus: FusionSession['status'] | null = null;

        while (Date.now() - startTime < timeoutMs) {
            const session = await this.getSession(sessionId);

            if (session.status !== lastStatus) {
                lastStatus = session.status;
                onStatusChange?.(session.status);
            }

            if (session.status === 'active') {
                return session;
            }

            if (session.status === 'error') {
                throw new Error(`Session failed: ${session.error || 'Unknown error'}`);
            }

            if (session.status === 'stopped') {
                throw new Error('Session was stopped');
            }

            // Poll every 2 seconds
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error('Timeout waiting for session to be ready');
    }

    // OpenCode API methods (called directly on the sandbox VPS)

    /**
     * Check if OpenCode is healthy on the sandbox
     */
    async checkOpenCodeHealth(sandboxIp: string): Promise<boolean> {
        try {
            const response = await fetch(`http://${sandboxIp}:4096${OPENCODE_HEALTH_ENDPOINT}`, {
                headers: this.getOpenCodeAuthHeader(),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Create an OpenCode session on the sandbox
     */
    async createOpenCodeSession(sandboxIp: string): Promise<OpenCodeSession> {
        const response = await fetch(`http://${sandboxIp}:4096${OPENCODE_SESSION_ENDPOINT}`, {
            method: 'POST',
            headers: {
                ...this.getOpenCodeAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            throw new Error(`Failed to create OpenCode session: ${response.status}`);
        }

        return response.json() as Promise<OpenCodeSession>;
    }

    /**
     * Get an OpenCode session from the sandbox
     */
    async getOpenCodeSession(sandboxIp: string, sessionId: string): Promise<OpenCodeSession> {
        const response = await fetch(`http://${sandboxIp}:4096${OPENCODE_SESSION_ENDPOINT}/${sessionId}`, {
            headers: this.getOpenCodeAuthHeader(),
        });

        if (!response.ok) {
            throw new Error(`Failed to get OpenCode session: ${response.status}`);
        }

        return response.json() as Promise<OpenCodeSession>;
    }

    /**
     * Send a message to an OpenCode session
     */
    async sendOpenCodeMessage(
        sandboxIp: string,
        sessionId: string,
        message: string,
        onChunk?: (chunk: string) => void
    ): Promise<void> {
        const parts: OpenCodeMessagePart[] = [{ type: 'text', text: message }];

        const response = await fetch(
            `http://${sandboxIp}:4096${OPENCODE_SESSION_ENDPOINT}/${sessionId}/message`,
            {
                method: 'POST',
                headers: {
                    ...this.getOpenCodeAuthHeader(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ parts }),
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to send message: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('No response body');
        }

        // Stream the response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() && onChunk) {
                    onChunk(line);
                }
            }
        }

        if (buffer.trim() && onChunk) {
            onChunk(buffer);
        }
    }

    /**
     * Abort an OpenCode session
     */
    async abortOpenCodeSession(sandboxIp: string, sessionId: string): Promise<void> {
        const response = await fetch(
            `http://${sandboxIp}:4096${OPENCODE_SESSION_ENDPOINT}/${sessionId}/abort`,
            {
                method: 'POST',
                headers: this.getOpenCodeAuthHeader(),
            }
        );

        if (!response.ok && response.status !== 404) {
            throw new Error(`Failed to abort session: ${response.status}`);
        }
    }
}

/**
 * High-level function to create a complete OpenCode session via Fusion
 * 
 * This handles the full flow:
 * 1. Create Fusion session (triggers VPS provisioning)
 * 2. Wait for VPS to be ready (status: 'active')
 * 3. Create OpenCode session on the sandbox
 * 
 * @returns Combined session info with both Fusion and OpenCode session IDs
 */
export async function createFusionOpenCodeSession(
    config: FusionClientConfig,
    sessionName: string,
    onStatusChange?: (status: string) => void
): Promise<{
    fusionSession: FusionSession;
    openCodeSessionId: string;
    sandboxIp: string;
}> {
    const client = new FusionClient(config);

    // Step 1: Create Fusion session
    onStatusChange?.('Creating cloud session...');
    const fusionSession = await client.createSession(sessionName);

    // Step 2: Wait for VPS to be ready
    onStatusChange?.('Provisioning cloud instance...');
    const readySession = await client.waitForSessionReady(
        fusionSession.id,
        300000, // 5 minute timeout
        (status) => {
            const statusMessages: Record<string, string> = {
                pending: 'Queued...',
                provisioning: 'Provisioning cloud instance...',
                starting: 'Starting OpenCode...',
                active: 'Ready!',
            };
            onStatusChange?.(statusMessages[status] || status);
        }
    );

    if (!readySession.sandboxIp) {
        throw new Error('Session is active but has no sandbox IP');
    }

    // Step 3: Create OpenCode session on the sandbox
    onStatusChange?.('Initializing OpenCode session...');
    
    // Retry a few times in case OpenCode is still starting up
    let openCodeSession: OpenCodeSession | null = null;
    let lastError: Error | null = null;
    
    for (let i = 0; i < 5; i++) {
        try {
            openCodeSession = await client.createOpenCodeSession(readySession.sandboxIp);
            break;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    if (!openCodeSession) {
        throw lastError || new Error('Failed to create OpenCode session');
    }

    return {
        fusionSession: readySession,
        openCodeSessionId: openCodeSession.id,
        sandboxIp: readySession.sandboxIp,
    };
}
