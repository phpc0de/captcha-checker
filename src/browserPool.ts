import { chromium, Browser } from 'patchright';

export class BrowserProcessPool {
    private pool: Browser[] = [];
    private maxProcesses: number;
    private isInitialized: boolean = false;

    constructor(maxProcesses: number = 3) {
        this.maxProcesses = Math.max(1, maxProcesses);
    }

    private getLaunchArguments(index: number): string[] {
        const baseArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-position=0,0',
            '--ignore-certificate-errors'
        ];

        // Alternating hardware GPU rendering profiles to eliminate Shared Canvas/WebGL hash uniformity
        const gpuProfiles = [
            ['--disable-gpu', '--use-gl=swiftshader'],
            ['--enable-gpu', '--use-gl=desktop', '--ignore-gpu-blocklist']
        ];

        const selectedProfile = gpuProfiles[index % gpuProfiles.length];
        return [...baseArgs, ...selectedProfile];
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn("[BrowserPool] Pool is already initialized.");
            return;
        }

        console.log(`[BrowserPool] Initializing process pool with ${this.maxProcesses} instances...`);

        for (let i = 0; i < this.maxProcesses; i++) {
            let attempts = 0;
            let launched = false;
            const maxAttempts = 3;

            while (attempts < maxAttempts && !launched) {
                try {
                    const args = this.getLaunchArguments(i);
                    const options: any = {
                        headless: true,
                        args: args,
                        defaultViewport: { width: 1920, height: 1080 }
                    };

                    console.log(`[BrowserPool] Spawning instance ${i + 1}/${this.maxProcesses} (Attempt ${attempts + 1})`);
                    if (process.env.PATCHRIGHT_EXECUTABLE_PATH) {
                        options.executablePath = process.env.PATCHRIGHT_EXECUTABLE_PATH;
                    }
                    const browser = await chromium.launch(options);
                    
                    browser.on('disconnected', () => {
                        console.error(`[BrowserPool] Browser instance ${i} disconnected unexpectedly.`);
                        this.pool = this.pool.filter(b => b !== browser);
                    });

                    this.pool.push(browser);
                    launched = true;
                } catch (error) {
                    attempts++;
                    console.error(`[BrowserPool] Failed to launch browser instance ${i} on attempt ${attempts}:`, error);
                    if (attempts >= maxAttempts) {
                        console.error(`[BrowserPool] Fatal error: Could not launch browser instance ${i} after ${maxAttempts} attempts.`);
                        await this.closeAll();
                        throw new Error(`Failed to initialize BrowserProcessPool: Browser spawn failed for instance ${i}`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
                }
            }
        }
        this.isInitialized = true;
        console.log(`[BrowserPool] Successfully initialized ${this.pool.length} instances.`);
    }

    async getBrowser(index: number): Promise<Browser> {
        if (!this.isInitialized || this.pool.length === 0) {
            await this.initialize();
        }
        if (this.pool.length === 0) {
            throw new Error("[BrowserPool] Cannot provide a browser: Pool initialization failed or pool is empty.");
        }
        return this.pool[index % this.pool.length];
    }

    async closeAll(): Promise<void> {
        console.log(`[BrowserPool] Closing all ${this.pool.length} browser instances...`);
        const closePromises = this.pool.map(browser => 
            browser.close().catch(err => console.error("[BrowserPool] Error closing browser instance:", err))
        );
        
        await Promise.all(closePromises);
        this.pool = [];
        this.isInitialized = false;
        console.log("[BrowserPool] All instances closed.");
    }
}
