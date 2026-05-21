import express from 'express';
// 切换为 patchright 驱动
import { chromium, Browser, BrowserContext, Page } from 'patchright'; 
import { BrowserProcessPool } from './browserPool';
import { ContextTopologyManager } from './contextManager';
import { ExecutionStackEnforcer } from './stealthHook';
import { AIVisionValidationClient } from './aiVisionClient';

const app = express();
app.use(express.json());

const pool = new BrowserProcessPool(3);

/**
 * =========================================================================
 * 【新增接口】功能：纯粹检测当前页面是否存在人机验证组件
 * =========================================================================
 */
app.post('/api/check-captcha', async (req, res) => {
    const { targetUrl } = req.body;
    if (!targetUrl) {
        return res.status(400).json({ success: false, error: "Missing targetUrl in request body." });
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
        // 使用 patchright 启动无痕环境进行检测
        const browser = await chromium.launch({ 
    headless: true,
    executablePath: process.env.PATCHRIGHT_EXECUTABLE_PATH, // 确保读取到了容器内的路径
    args: ['--no-sandbox', '--disable-setuid-sandbox']     // 必须加上这两行
});

        context = await browser.newContext();
        const page = await context.newPage();
        
        console.log(`[+] Scanning captcha status on: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle' }).catch(() => {});
        
        // 动态检测页面中是否存在 Arkose Labs 或 Octocaptcha 的特征
        const captchaStatus = await page.evaluate(() => {
            // 1. 检测前置/后置注册流程中的 Arkose Iframe
            const iframes = Array.from(document.querySelectorAll('iframe'));
            const hasArkoseIframe = iframes.some(iframe => {
                const src = iframe.src || '';
                return src.includes('arkoselabs.com') || src.includes('octocaptcha');
            });

            // 2. 检测后置触发按钮的存在性 (Visual Puzzle Enforcer)
            const postVerifyBtn = document.querySelector('.js-octocaptcha-load-captcha');
            const hasPostButton = postVerifyBtn !== null;

            // 3. 检测验证码容器是否暴露
            const container = document.querySelector('[data-continue-to="captcha-and-submit-container"]');
            
            return {
                isCaptchaTriggered: hasArkoseIframe,
                hasPostSubmitChallenge: hasPostButton,
                isContainerPresent: container !== null,
                details: {
                    iframeCount: iframes.length,
                    detectedSrcs: iframes.map(i => i.src).filter(src => src.includes('arkose') || src.includes('captcha'))
                }
            };
        });

        await context.close();
        await browser.close();

        // 综合判定逻辑
        const requiresHumanVerification = captchaStatus.isCaptchaTriggered || captchaStatus.hasPostSubmitChallenge;

        res.json({
            success: true,
            requiresHumanVerification, // 核心字段：是否需要/存在人机验证
            captchaType: requiresHumanVerification ? 'ArkoseLabs / Octocaptcha' : 'None',
            evidence: captchaStatus
        });

    } catch (err: any) {
        if (context) await context.close();
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: err.message });
    }
});


/**
 * =========================================================================
 * 【核心接口重构】功能：改用 Patchright 驱动的 GitHub 自动过盾注册流
 * =========================================================================
 */
app.post('/api/register', async (req, res) => {
    const { targetUrl = "https://github.com", proxy = "http://example.com" } = req.body;
    
    try {
        const mgr = new ContextTopologyManager();
        const browser = await pool.getBrowser(0); // 假设 pool 内部已重构为 patchright 驱动
        const context = await mgr.createContext(browser, proxy, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        const page = await context.newPage();
        
        await new ExecutionStackEnforcer().injectRuntimeHooks(page);
        
        console.log(`[+] Navigate to ${targetUrl}`);
        // Patchright/Playwright 标准等待事件为 networkidle
        await page.goto(targetUrl, { waitUntil: 'networkidle' }).catch(() => {});
        
        console.log("[+] Initiating Modern GitHub Registration Flow via Patchright...");
        
        // Helper: 等待元素可交互并模拟打字 (适配 Playwright/Patchright API)
        const waitAndType = async (selector: string, text: string) => {
            await page.waitForFunction((sel) => {
                const el = document.querySelector(sel) as HTMLInputElement;
                return el && !el.disabled && el.getBoundingClientRect().width > 0;
            }, selector, { timeout: 15000 });
            
            await page.focus(selector);
            // Patchright 内置防检测输入，但保留你的随机延迟逻辑
            for (const char of text) {
                await page.keyboard.type(char, { delay: 30 + Math.random() * 70 });
            }
        };

        // Helper: 仿真轨迹点击 (适配 Playwright/Patchright API)
        const waitAndClick = async (selector: string) => {
            await page.waitForFunction((sel) => {
                const btn = document.querySelector(sel) as HTMLButtonElement;
                return btn && !btn.disabled && !btn.classList.contains('disabled');
            }, selector, { timeout: 10000 });
            
            const btn = await page.$(selector);
            if (btn) {
                const box = await btn.boundingBox();
                if (box) {
                    const cx = box.x + box.width / 2;
                    const cy = box.y + box.height / 2;
                    const splinePath: any[] = await page.evaluate((x, y) => (window as any).calculateSplinePath(10, 10, x, y), cx, cy);
                    for (const point of splinePath) {
                        await page.mouse.move(point.x, point.y);
                        await new Promise(r => setTimeout(r, 4));
                    }
                    await page.mouse.click(cx, cy, { delay: 40 + Math.random() * 40 });
                }
            }
        };

        // 1-4. 核心表单填写流
        await waitAndType('#email', `testuser${Date.now()}@example.com`);
        await waitAndClick('button[data-continue-to="password-container"]');
        
        await waitAndType('#password', `S!tr0ngP@ss${Date.now()}`);
        await waitAndClick('button[data-continue-to="username-container"]');
        
        await waitAndType('#login', `user-${Date.now()}-git`);
        await waitAndClick('button[data-continue-to="opt-in-container"]');
        
        await waitAndType('#opt_in', 'n');
        await waitAndClick('button[data-continue-to="captcha-and-submit-container"]');
        
        // 5. 攻坚 Arkose Labs 前置盾
        console.log("[+] Analyzing Arkose Challenge...");
        const visionClient = new AIVisionValidationClient();
        
        // Playwright/Patchright 定位 iframe 需要使用 frameLocator 或等待元素后转化
        const iframeElement = await page.waitForSelector('iframe[src*="arkoselabs.com"], iframe[src*="octocaptcha"]', { timeout: 15000 }).catch(()=>null);
        
        if (iframeElement) {
            console.log("[!] Arkose Shield Detected, entering multi-step AI loop...");
            const frame = await iframeElement.contentFrame();
            
            if (frame) {
                const verifyBtn = await frame.waitForSelector('.button-verify, #verify-button', { timeout: 5000 }).catch(()=>null);
                if (verifyBtn) await verifyBtn.click();
                
                let solved = false;
                for (let step = 1; step <= 5; step++) {
                    await new Promise(r => setTimeout(r, 2000));
                    
                    const success = await frame.$('.box-success, #challenge-success').catch(()=>null);
                    if (success) {
                        solved = true;
                        console.log("[+] Arkose Challenge solved successfully!");
                        break;
                    }

                    console.log(`[+] Arkose Step ${step}: Snapping visual context...`);
                    const gameCore = await frame.$('#game-core, .challenge-container');
                    if (!gameCore) break;
                    
                    // 适配 Playwright 截图 API (返回 Buffer 后转为 base64)
                    const screenshotBuffer = await gameCore.screenshot();
                    const screenshot = screenshotBuffer.toString('base64');
                    const coordinates = await visionClient.analyzeElementLayout(screenshot);

                    // 执行 AI 判定的交互 (旋转或点击)
                    if (coordinates.need_rotate_clicks > 0) {
                        const rotateBtn = await frame.$('.rotate-right, #rotate-right-button');
                        for(let r = 0; r < coordinates.need_rotate_clicks; r++) {
                            if (rotateBtn) await rotateBtn.click();
                            await new Promise(res => setTimeout(res, 300));
                        }
                        const submitAnswer = await frame.$('.button-submit, #submit-button');
                        if (submitAnswer) await submitAnswer.click();
                    } else if (coordinates.click_x && coordinates.click_y) {
                        const frameBox = await iframeElement.boundingBox();
                        const coreBox = await gameCore.boundingBox();
                        if (frameBox && coreBox) {
                            const absX = frameBox.x + coreBox.x + coordinates.click_x;
                            const absY = frameBox.y + coreBox.y + coordinates.click_y;
                            
                            const splinePath: any[] = await page.evaluate((x, y) => (window as any).calculateSplinePath(10, 10, x, y), absX, absY);
                            for (const point of splinePath) {
                                await page.mouse.move(point.x, point.y);
                                await new Promise(r => setTimeout(r, 4));
                            }
                            await page.mouse.click(absX, absY, { delay: 50 });
                        }
                    }
                }
            }
        } else {
             console.log("[+] No captcha shield detected or bypassed via high-trust IP.");
        }

        // 6. 最终提交
        await waitAndClick('button[type="submit"][data-optimizely-event="click.signup_continue.create_account"]');
        
        // 7. 处理提交后可能出现的后置 "Visual puzzle"
        console.log("[+] Awaiting Post-Submit Validation...");
        await new Promise(r => setTimeout(r, 4000)); 
        
        const postVerifyBtn = await page.$('.js-octocaptcha-load-captcha');
        if (postVerifyBtn) {
             console.log("[!] Post-Submit 'Verify your account' detected. Triggering visual puzzle...");
             await waitAndClick('.js-octocaptcha-load-captcha');
             await new Promise(r => setTimeout(r, 2000));
             
             const postIframe = await page.waitForSelector('iframe[src*="arkoselabs.com"], iframe[src*="octocaptcha"]', { timeout: 15000 }).catch(()=>null);
             if (postIframe) {
                 const pFrame = await postIframe.contentFrame();
                 if (pFrame) {
                     for (let step = 1; step <= 5; step++) {
                         await new Promise(r => setTimeout(r, 2500));
                         const success = await pFrame.$('.box-success, #challenge-success').catch(()=>null);
                         if (success) {
                             console.log("[+] Post-Submit Arkose Challenge solved successfully!");
                             break;
                         }

                         console.log(`[+] Post-Submit Arkose Step ${step}...`);
                         const gameCore = await pFrame.$('#game-core, .challenge-container');
                         if (!gameCore) break;
                         
                         const screenshotBuffer = await gameCore.screenshot();
                         const screenshot = screenshotBuffer.toString('base64');
                         const coordinates = await visionClient.analyzeElementLayout(screenshot);
                         
                         if (coordinates.need_rotate_clicks > 0) {
                             const rotateBtn = await pFrame.$('.rotate-right, #rotate-right-button');
                             for(let r = 0; r < coordinates.need_rotate_clicks; r++) {
                                 if (rotateBtn) await rotateBtn.click();
                                 await new Promise(res => setTimeout(res, 300));
                             }
                             const submitAnswer = await pFrame.$('.button-submit, #submit-button');
                             if (submitAnswer) await submitAnswer.click();
                         } else if (coordinates.click_x && coordinates.click_y) {
                             const frameBox = await postIframe.boundingBox();
                             const coreBox = await gameCore.boundingBox();
                             if (frameBox && coreBox) {
                                 const absX = frameBox.x + coreBox.x + coordinates.click_x;
                                 const absY = frameBox.y + coreBox.y + coordinates.click_y;
                                 
                                 const splinePath: any[] = await page.evaluate((x, y) => (window as any).calculateSplinePath(10, 10, x, y), absX, absY);
                                 for (const point of splinePath) {
                                     await page.mouse.move(point.x, point.y);
                                     await new Promise(r => setTimeout(r, 4));
                                 }
                                 await page.mouse.click(absX, absY, { delay: 50 });
                             }
                         }
                     }
                 }
             }
        }
        
        // 适配 Playwright 导航等待 API
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});

        const cookies = await context.cookies();
        await context.close();
        
        res.json({ success: true, cookies });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

pool.initialize().then(() => {
    app.listen(3000, () => {
        console.log("[+] Crawler API Server running on http://0.0.0");
    });
}).catch(console.error);
