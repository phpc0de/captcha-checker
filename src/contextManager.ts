import { Browser, BrowserContext } from 'puppeteer';

export class ContextTopologyManager {
    async createContext(browser: Browser, proxyUrl: string, userAgent: string): Promise<BrowserContext> {
        // Dynamically inject the proxy if provided
        const contextOptions: any = {};
        if (proxyUrl && proxyUrl.trim() !== '') {
            contextOptions.proxyServer = proxyUrl;
        }

        const context = await browser.createIncognitoBrowserContext(contextOptions);
        
        // Auto-inject to all pages created in this context
        context.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                try {
                    const page = await target.page();
                    if (page) {
                        await page.setUserAgent(userAgent);
                        await page.evaluateOnNewDocument((ua) => {
                            const data = { 
                                brands: [{ brand: 'Google Chrome', version: '120' }], 
                                platform: 'Windows', 
                                mobile: false 
                            };
                            Object.defineProperty(navigator, 'userAgentData', { value: data, writable: false, configurable: true });
                        }, userAgent);
                    }
                } catch (e) {
                    // Ignore errors if target is closed quickly
                }
            }
        });

        return context;
    }
}
