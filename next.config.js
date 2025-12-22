const { i18n } = require('./next-i18next.config')

module.exports = {
  i18n,
  reactStrictMode: true,
  // Required by Next i18n with API routes, otherwise API routes 404 when fetching without trailing slash
  trailingSlash: true,

  // --- 新增：图片优化配置 ---
  images: {
    // 方案 A：允许所有域名的图片（推荐，省事）
    // 这样无论 OneDrive 的 API 重定向到哪个微软服务器，Next.js 都能处理
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    
    // 方案 B：如果你发现 Vercel 的图片优化额度不够用，或者图片加载超时
    // 可以取消注释下面这一行，这将禁用服务端压缩，直接显示原图
    // unoptimized: true,
  },
}