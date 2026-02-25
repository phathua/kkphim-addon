const KKPHIM_IMG_ROOT = 'https://phimimg.com/uploads/movies/';
import { KKPHIM_PROXY_KEY, KKPHIM_REFERER } from './utils/key';

// Salted XOR Hex Encoder/Decoder (Robust version)
const mask = (str: string) => {
    const salt = Math.floor(Math.random() * 256);
    const saltHex = salt.toString(16).padStart(2, '0');
    const encoded = encodeURIComponent(str);
    const masked = Array.from(encoded).map(c => (c.charCodeAt(0) ^ KKPHIM_PROXY_KEY ^ salt).toString(16).padStart(2, '0')).join('');
    return saltHex + masked;
}
const unmask = (hex: string) => {
    try {
        const salt = parseInt(hex.substring(0, 2), 16);
        const data = hex.substring(2);
        let decoded = '';
        for (let i = 0; i < data.length; i += 2) {
            const byte = parseInt(data.substring(i, i + 2), 16);
            decoded += String.fromCharCode(byte ^ KKPHIM_PROXY_KEY ^ salt);
        }
        return decodeURIComponent(decoded);
    } catch { return ''; }
}

const resolveUrl = (base: string, rel: string) => {
    if (rel.startsWith('http')) return rel;
    if (rel.startsWith('//')) return 'https:' + rel;
    const url = new URL(base);
    if (rel.startsWith('/')) return url.origin + rel;
    const dir = base.substring(0, base.lastIndexOf('/') + 1);
    return dir + rel;
};

export async function handleProxy(c: any) {
    const segments = c.req.path.split('/');
    const type = segments[2];

    const browserHeaders = {
        'accept': '*/*',
        'accept-language': 'vi,en;q=0.9,en-GB;q=0.8,en-US;q=0.7,fr-FR;q=0.6,fr;q=0.5',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'Referer': KKPHIM_REFERER,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    };

    if (type === 'i') {
        const hex = c.req.param('hex');
        const targetUrl = unmask(hex).trim();
        if (!targetUrl) return c.text('Invalid image token', 400);

        const cache = (caches as any).default;
        const cacheKey = new Request(c.req.url);
        let cached = await cache.match(cacheKey);
        if (cached) return cached;
        try {
            const res = await fetch(targetUrl, {
                headers: browserHeaders,
                redirect: 'follow'
            });
            if (!res.ok) return c.text(`Image Source Error: ${res.status}`, res.status);

            let newRes = new Response(res.body, res);
            newRes.headers.set('Access-Control-Allow-Origin', '*');
            newRes.headers.set('Cache-Control', 'public, max-age=2592000');
            c.executionCtx.waitUntil(cache.put(cacheKey, newRes.clone()));
            return newRes;
        } catch (e) { return c.text('Image Proxy Exception', 500); }
    }

    if (type === 'v') {
        const hex = c.req.param('hex');
        const baseUrl = unmask(hex).trim();
        if (!baseUrl) return c.text('Invalid video token', 400);

        const targetUrl = baseUrl;
        console.log(`[Proxy Video] Fetching: ${targetUrl}`);

        try {
            const res = await fetch(targetUrl, {
                method: 'GET',
                headers: browserHeaders,
                redirect: 'follow'
            });

            if (!res.ok) {
                const headStr = JSON.stringify([...res.headers]);
                console.error(`[Proxy Video] Source Failed: ${res.status}. Headers: ${headStr}`);
                return c.text(`Source Error: ${res.status} | URL: ${targetUrl}`, res.status);
            }

            const contentType = res.headers.get('content-type') || '';
            const isPlaylist = targetUrl.includes('.m3u8') || contentType.includes('mpegurl');

            if (isPlaylist) {
                let content = await res.text();
                const workerOrigin = new URL(c.req.url).origin;

                const maskUrl = (url: string) => {
                    const resolved = resolveUrl(targetUrl, url);
                    const filename = (resolved.split('/').pop() || 'file.m3u8').split('?')[0];
                    return `${workerOrigin}/p/v/${mask(resolved)}/${filename}`;
                };

                content = content.split('\n').map(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) return line;
                    return maskUrl(trimmed);
                }).join('\n');

                content = content.replace(/(URI=")([^"]+)(")/g, (m, p1, p2, p3) => {
                    return `${p1}${maskUrl(p2)}${p3}`;
                });

                return new Response(content, {
                    headers: {
                        'Content-Type': 'application/vnd.apple.mpegurl',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache'
                    }
                });
            }

            let newRes = new Response(res.body, res);
            newRes.headers.set('Access-Control-Allow-Origin', '*');
            newRes.headers.delete('set-cookie');
            return newRes;

        } catch (e: any) {
            console.error(`[Proxy Video] Exception: ${e.message}`);
            return c.text(`Proxy Exception: ${e.message}`, 500);
        }
    }
    return c.text('Not Found', 404);
}

export { mask };
