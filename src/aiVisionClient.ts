import OpenAI from 'openai';
import pLimit from 'p-limit';

export interface VisionInferenceResult {
    click_x: number;
    click_y: number;
    need_rotate_clicks: number;
}

export class AIVisionValidationClient {
    private openai: OpenAI;
    private limiter: ReturnType<typeof pLimit>;
    private model: string;

    constructor(
        baseURL: string = process.env.AI_API_BASE || "http://127.0.0.1:11434/v1",
        apiKey: string = process.env.AI_API_KEY || "local-token",
        model: string = process.env.AI_MODEL || "qwen2.5-vl",
        maxConcurrency: number = 2
    ) {
        this.model = model;
        this.openai = new OpenAI({ apiKey, baseURL });
        this.limiter = pLimit(maxConcurrency);
    }

    async analyzeElementLayout(base64Image: string): Promise<VisionInferenceResult> {
        return this.limiter(async () => {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    }
                ],
                response_format: { type: "json_object" }
            });

            const content = response.choices[0]?.message?.content || "{}";
            const parsed = JSON.parse(content);
            return {
                click_x: typeof parsed.click_x === 'number' ? parsed.click_x : 100,
                click_y: typeof parsed.click_y === 'number' ? parsed.click_y : 150,
                need_rotate_clicks: typeof parsed.need_rotate_clicks === 'number' ? parsed.need_rotate_clicks : 0
            };
        });
    }
}