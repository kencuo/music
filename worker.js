export default {
  async fetch(request, env, ctx) {
    // 改成你仓库里那份纯 JS 脚本的实际路径（文件名如果有中文/空格要做 URL 编码）
    const target = 'https://raw.githubusercontent.com/kencuo/music/main/' +
      encodeURIComponent('听歌.js');

    const upstream = await fetch(target, {
      cf: { cacheTtl: 30, cacheEverything: true }   // 边缘缓存 30 秒，基本等于实时
    });

    if (!upstream.ok) {
      return new Response('// upstream fetch failed: ' + upstream.status, { status: 502 });
    }

    const body = await upstream.text();
    return new Response(body, {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=30'
      }
    });
  }
};
