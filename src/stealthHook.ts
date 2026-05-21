import { Page } from 'patchright';

export class ExecutionStackEnforcer {
    async injectRuntimeHooks(page: Page): Promise<void> {
        await page.evaluateOnNewDocument(() => {
            // --- 1. Native Call-Stack Alignment (Function.prototype.toString Cloak) ---
            const define = (obj: any, prop: string, val: any) => 
                Object.defineProperty(obj, prop, { value: val, writable: false, enumerable: false, configurable: true });
            
            const hook = function() { /* human track logic */ };
            define(hook, 'toString', () => "function () { [native code] }");
            
            const originalToString = Function.prototype.toString;
            define(Function.prototype, 'toString', function(this: any) {
                return this === hook ? "function () { [native code] }" : originalToString.call(this);
            });

            // --- 2. Human Kinematics Spline Generator (Fitts's Law + Bezier) ---
            
            // Helper: Gaussian Box-Muller transform
            const randomGaussian = (mean: number, stdDev: number): number => {
                let u = 0, v = 0;
                while (u === 0) u = Math.random(); 
                while (v === 0) v = Math.random();
                const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
                return (num * stdDev) + mean;
            };

            // Helper: Cubic Bezier curve evaluation at t (0 <= t <= 1)
            const cubicBezier = (t: number, p0: number, p1: number, p2: number, p3: number): number => {
                const u = 1 - t;
                const tt = t * t;
                const uu = u * u;
                const uuu = uu * u;
                const ttt = tt * t;
                return (uuu * p0) + (3 * uu * t * p1) + (3 * u * tt * p2) + (ttt * p3);
            };

            interface Point { x: number; y: number; t: number; }

            (window as any).calculateSplinePath = (startX: number, startY: number, endX: number, endY: number): Point[] => {
                const steps: Point[] = [];
                let currentTime = Date.now();
                
                const distance = Math.hypot(endX - startX, endY - startY);
                
                // Fitts's Law distance calculation: T = a + b * log2(1 + D/W)
                const W = 40; 
                const totalPoints = Math.max(15, Math.min(80, Math.floor(10 + 6 * Math.log2(1 + distance / W))));
                
                // Generate jitter curve offsets for Bézier control points
                const isRight = Math.random() > 0.5;
                const offsetMagnitude = (distance * 0.15) * (isRight ? 1 : -1);
                
                // Pull handles outwards simulating physiological arc of an arm/wrist movement
                const control1X = startX + (endX - startX) * 0.25 + offsetMagnitude;
                const control1Y = startY + (endY - startY) * 0.25 - offsetMagnitude;
                
                const control2X = startX + (endX - startX) * 0.75 - offsetMagnitude;
                const control2Y = startY + (endY - startY) * 0.75 + offsetMagnitude;

                for (let i = 1; i <= totalPoints; i++) {
                    const t = i / totalPoints;
                    
                    // Ease-In-Out multiplier mapping velocity distribution
                    // Simulates acceleration midpoint and deceleration at the target
                    const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

                    let targetX = cubicBezier(easeT, startX, control1X, control2X, endX);
                    let targetY = cubicBezier(easeT, startY, control1Y, control2Y, endY);
                    
                    // Overshoot mechanics on the final few points
                    if (i >= totalPoints - 3 && i < totalPoints) {
                        targetX += randomGaussian(0, 1.5);
                        targetY += randomGaussian(0, 1.5);
                    }

                    // Local jitter representing physical micro-tremors (±1/±2 px offsets)
                    const jitterX = randomGaussian(0, 0.8);
                    const jitterY = randomGaussian(0, 0.8);
                    
                    // Time intervals mapping a Gaussian distribution (~125Hz/250Hz clock sample rate)
                    // Discrete intervals around 4ms or 8ms multiples
                    const basePollingInterval = Math.random() > 0.4 ? 8 : 4; 
                    const timeDelta = Math.floor(Math.abs(randomGaussian(basePollingInterval, 1.2)));
                    
                    // Ensure we respect integer clock multiples roughly
                    const alignedDelta = Math.max(1, Math.round(timeDelta / 4) * 4 || timeDelta);
                    currentTime += alignedDelta;

                    steps.push({ 
                        x: Math.round((targetX + jitterX) * 100) / 100, 
                        y: Math.round((targetY + jitterY) * 100) / 100, 
                        t: currentTime 
                    });
                }
                
                // Final lock-in strictly to target coordinates to prevent click misses
                steps[steps.length - 1].x = parseFloat(endX.toFixed(2));
                steps[steps.length - 1].y = parseFloat(endY.toFixed(2));

                return steps;
            };
        });
    }
}
