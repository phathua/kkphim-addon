import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()
app.use('*', cors())

// Configuration from wrangler.toml
const API_BASE = 'https://phimapi.com'
const IMG_BASE = 'https://phimimg.com'

let GENRES: { name: string, slug: string }[] = []
let COUNTRIES: { name: string, slug: string }[] = []
let lastMetaUpdate = 0
const META_CACHE_TTL = 3600000 // 1 hour

async function ensureMetadata() {
    if (GENRES.length > 0 && COUNTRIES.length > 0 && (Date.now() - lastMetaUpdate < META_CACHE_TTL)) {
        return
    }

    try {
        console.log('[KKPhim] Refreshing genres and countries...')
        const [genreRes, countryRes] = await Promise.all([
            fetch(`${API_BASE}/the-loai`),
            fetch(`${API_BASE}/quoc-gia`)
        ])

        const genreData: any = await genreRes.json()
        const countryData: any = await countryRes.json()

        // KKPhim returns direct array for genres/countries
        if (Array.isArray(genreData)) {
            GENRES = genreData.map((i: any) => ({ name: i.name, slug: i.slug }))
        }
        if (Array.isArray(countryData)) {
            COUNTRIES = countryData.map((i: any) => ({ name: i.name, slug: i.slug }))
        }

        lastMetaUpdate = Date.now()
        console.log(`[KKPhim] Updated: ${GENRES.length} genres, ${COUNTRIES.length} countries`)
    } catch (e) {
        console.error('[KKPhim] Failed to fetch metadata', e)
    }
}

async function getManifest() {
    await ensureMetadata()
    const EXTRA_CATALOG = [
        { name: 'genre', options: GENRES.map(g => g.name), isRequired: false },
        { name: 'country', options: COUNTRIES.map(c => c.name), isRequired: false }
    ]

    return {
        id: 'com.vibe.kkphim.pro',
        name: 'KKPhim Stremio Addon',
        version: '1.0.0',
        description: 'Addon xem phim từ KKPhim (phimapi.com) với dữ liệu cập nhật tự động.',
        resources: [
            { name: 'catalog', types: ['movie', 'series', 'anime', 'tv'], idPrefixes: ['kkphim:'] },
            { name: 'meta', types: ['movie', 'series', 'anime', 'tv'], idPrefixes: ['kkphim:'] },
            { name: 'stream', types: ['movie', 'series', 'anime', 'tv'], idPrefixes: ['kkphim:', 'tt'] }
        ],
        types: ['movie', 'series', 'anime', 'tv'],
        catalogs: [
            { type: 'movie', id: 'kkphim_search', name: 'KKPhim - Tìm kiếm', extra: [{ name: 'search', isRequired: true }] },
            { type: 'movie', id: 'kkphim_phim-moi', name: 'KKPhim - Phim Mới', extra: EXTRA_CATALOG },
            { type: 'series', id: 'kkphim_phim-bo', name: 'KKPhim - Phim Bộ', extra: EXTRA_CATALOG },
            { type: 'movie', id: 'kkphim_phim-le', name: 'KKPhim - Phim Lẻ', extra: EXTRA_CATALOG },
            { type: 'series', id: 'kkphim_tv-shows', name: 'KKPhim - Shows', extra: EXTRA_CATALOG },
            { type: 'movie', id: 'kkphim_hoat-hinh', name: 'KKPhim - Hoạt Hình', extra: EXTRA_CATALOG }
        ],
        idPrefixes: ['kkphim:', 'tt']
    }
}

app.get('/manifest.json', async (c) => c.json(await getManifest()))

app.get('/*', async (c) => {
    let path = decodeURIComponent(c.req.path)
    console.log(`[Request] ${path}`)

    if (path === '/manifest.json') return c.json(await getManifest())

    // Catalog handles
    if (path.startsWith('/catalog/')) {
        let parts = path.substring(9).split('/')
        const type = parts[0]
        let idRaw = parts[1] || ''
        let extraRaw = parts[2] || ''

        let id = idRaw.split('.json')[0]
        let extra = extraRaw.split('.json')[0]

        await ensureMetadata()
        let searchQuery = '', genreSlug = '', countrySlug = ''
        if (extra) {
            extra.split('&').forEach(p => {
                const [k, v] = p.split('=')
                if (k === 'search') searchQuery = v
                if (k === 'genre') genreSlug = GENRES.find(g => g.name === v)?.slug || ''
                if (k === 'country') countrySlug = COUNTRIES.find(c => c.name === v)?.slug || ''
            })
        }

        let apiUrl = ''
        if (searchQuery) {
            apiUrl = `${API_BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&page=1`
        } else if (id && id !== 'kkphim_search') {
            const listType = id.replace('kkphim_', '')
            apiUrl = `${API_BASE}/v1/api/danh-sach/${listType}?page=1`
            if (genreSlug) apiUrl += `&category=${genreSlug}`
            if (countrySlug) apiUrl += `&country=${countrySlug}`
        } else {
            // Default to phim-moi using V3 for best data
            apiUrl = `${API_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=1`
        }

        try {
            const res = await fetch(apiUrl)
            const result: any = await res.json()

            // Normalize items from different API versions
            let items = []
            if (result.items) items = result.items // V3
            else if (result.data?.items) items = result.data.items // V1

            const metas = items.map((item: any) => {
                // V1 has relative paths, V3 has full URLs
                const poster = item.poster_url.startsWith('http') ? item.poster_url : `${IMG_BASE}/${item.poster_url}`
                return {
                    id: `kkphim:${item.slug}`,
                    type: (item.type === 'series' || item.type === 'hoathinh') ? 'series' : 'movie',
                    name: item.name,
                    poster: poster,
                    description: `${item.origin_name} (${item.year})`,
                    releaseInfo: item.year?.toString()
                }
            })
            return c.json({ metas })
        } catch (e) {
            return c.json({ metas: [] })
        }
    }

    // Meta handles
    if (path.startsWith('/meta/')) {
        const parts = path.substring(6).split('/')
        let id = parts[parts.length - 1].split('.json')[0]
        const slug = id.includes(':') ? id.split(':')[1] : id

        try {
            const res = await fetch(`${API_BASE}/phim/${slug}`)
            const result: any = await res.json()
            const item = result.movie
            if (!item) return c.json({ meta: {} })

            const fixImg = (u: string) => u ? (u.startsWith('http') ? u : `${IMG_BASE}/${u}`) : ''

            const meta: any = {
                id: `kkphim:${item.slug}`,
                type: (item.type === 'series' || (result.episodes && result.episodes[0]?.server_data.length > 1)) ? 'series' : 'movie',
                name: item.name,
                poster: fixImg(item.thumb_url),
                background: fixImg(item.poster_url),
                description: item.content?.replace(/<[^>]*>?/gm, '') || '',
                releaseInfo: item.year?.toString(),
                runtime: item.time,
                genres: item.category?.map((c: any) => c.name) || [],
                director: item.director || [],
                cast: item.actor || [],
                imdbRating: item.tmdb?.vote_average?.toString()
            }

            if (meta.type === 'series') {
                meta.videos = []
                result.episodes?.forEach((s: any) => s.server_data.forEach((ep: any) => {
                    meta.videos.push({
                        id: `kkphim:${item.slug}:1:${ep.slug}`,
                        title: `Tập ${ep.name} (${s.server_name})`,
                        season: 1,
                        episode: parseInt(ep.name) || (meta.videos.length + 1),
                        released: new Date().toISOString()
                    })
                }))
                meta.videos.sort((a: any, b: any) => a.episode - b.episode)
            }

            return c.json({ meta })
        } catch (e) { return c.json({ meta: {} }) }
    }

    // Stream handles
    if (path.startsWith('/stream/')) {
        const parts = path.substring(8).split('/')
        const idRaw = parts[parts.length - 1].split('.json')[0]

        let slug = '', epSlug = '1'
        if (idRaw.startsWith('kkphim:')) {
            const bits = idRaw.split(':')
            slug = bits[1]
            epSlug = bits[3] || '1'
        }

        if (!slug) return c.json({ streams: [] })

        try {
            const res = await fetch(`${API_BASE}/phim/${slug}`)
            const result: any = await res.json()
            const episodes = result.episodes || []

            const streams: any[] = []
            episodes.forEach((s: any) => {
                const ep = s.server_data.find((e: any) => e.slug === epSlug || e.name === epSlug || e.name === `Tập ${epSlug}`)
                if (ep?.link_m3u8) {
                    streams.push({
                        name: `KKPhim\n${s.server_name}`,
                        title: `${result.movie.name}\n${ep.name}`,
                        url: ep.link_m3u8
                    })
                }
            })
            return c.json({ streams })
        } catch (e) { return c.json({ streams: [] }) }
    }

    return c.text('Not Found', 404)
})

export default app
