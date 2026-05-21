FROM node:20-slim

# 安装最新稳定版 Google Chrome 浏览器以及中文字体（WQY-Zenhei）以支持验证码中的汉字渲染
# 同时安装了运行无头浏览器所必需的 Linux 核心动态链接库
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制描述文件并通过 npm ci 严格锁定版本安装
COPY package*.json ./

# 核心适配点 1：跳过 Playwright/Patchright 默认的浏览器下载，直接使用上面 apt 安装的 Chrome，极大减小镜像体积
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN npm ci

COPY . .

# 核心适配点 2：注入环境变量，显式告知 Patchright/Playwright 直接调用容器内的真实 Chrome 路径
ENV PATCHRIGHT_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

CMD ["npx", "tsx", "src/main.ts"]
