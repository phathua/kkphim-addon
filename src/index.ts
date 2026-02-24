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

// Mapping cache
const imdbCache = new Map<string, string>()

function decodeHtml(text: string): string {
    return text
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\u00a0/g, ' ') // non-breaking space
}

async function getSlugFromImdb(imdbId: string, type: string, season?: number): Promise<string | null> {
    const cacheKey = (type === 'series' && season) ? `${imdbId}:${season}` : imdbId
    if (imdbCache.has(cacheKey)) return imdbCache.get(cacheKey)!

    try {
        console.log(`[Mapping] Starting for ${imdbId} (${type}, S${season || 1})`)

        // 1. Get info from Cinemeta (fallback endpoints)
        let cinemetaData: any = null
        const cinemetaUrls = [
            `https://cinemeta-live.strem.io/meta/${type}/${imdbId}.json`,
            `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`
        ]

        for (const url of cinemetaUrls) {
            try {
                const res = await fetch(url)
                const data = await res.json()
                if (data?.meta?.name) {
                    cinemetaData = data
                    break
                }
            } catch (e) { }
        }

        const cinemeta = cinemetaData?.meta
        if (!cinemeta) {
            console.warn(`[Mapping] Cinemeta meta not found for ${imdbId}`)
            return null
        }

        const tmdbId = cinemeta.moviedb_id
        const year = cinemeta.releaseInfo ? parseInt(cinemeta.releaseInfo) : null
        const name = cinemeta.name
        console.log(`[Mapping] Info: Name="${name}", Year=${year}, TMDB=${tmdbId}`)

        // 2. Try KKPhim TMDB endpoint
        if (tmdbId) {
            const kkType = type === 'series' ? 'tv' : 'movie'
            const tmdbUrl = `${API_BASE}/tmdb/${kkType}/${tmdbId}`
            console.log(`[Mapping] Checking KKPhim TMDB: ${tmdbUrl}`)

            const tmdbRes = await fetch(tmdbUrl)
            const tmdbData: any = await tmdbRes.json()
            if (tmdbData.status && tmdbData.movie?.slug) {
                console.log(`[Mapping] SUCCESS (TMDB Match): ${tmdbData.movie.slug}`)
                imdbCache.set(cacheKey, tmdbData.movie.slug)
                return tmdbData.movie.slug
            }
        }

        // 3. Fallback: Search by title
        const searchKeywords = [
            name,
            name.split(':')[0],
            name.split(' (')[0].split(' - ')[0]
        ].filter((v, i, a) => a.indexOf(v) === i)

        for (const kw of searchKeywords) {
            console.log(`[Mapping] Trying search: "${kw}"`)
            const searchRes = await fetch(`${API_BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(kw)}`)
            const searchData: any = await searchRes.json()
            const items = searchData.data?.items || []

            for (const item of items) {
                const itemOrigin = decodeHtml(item.origin_name || '').toLowerCase()
                const itemName = decodeHtml(item.name || '').toLowerCase()
                const targetTitle = name.toLowerCase()

                const nameMatch = itemOrigin === targetTitle || itemName === targetTitle ||
                    itemOrigin.includes(targetTitle) || targetTitle.includes(itemOrigin)

                const yearMatch = !year || item.year === year || item.year === year - 1 || item.year === year + 1

                if (yearMatch && nameMatch) {
                    if (type === 'series' && season) {
                        const sStr = season.toString()
                        const hasSeason = itemName.includes(`phần ${sStr}`) ||
                            itemName.includes(`season ${sStr}`) ||
                            itemName.includes(` s${sStr}`) ||
                            (season === 1 && !itemName.includes('phần ') && !itemName.includes('season '))

                        if (hasSeason) {
                            console.log(`[Mapping] SUCCESS (Search Match S${sStr}): ${item.slug}`)
                            imdbCache.set(cacheKey, item.slug)
                            return item.slug
                        }
                    } else {
                        console.log(`[Mapping] SUCCESS (Search Match): ${item.slug}`)
                        imdbCache.set(cacheKey, item.slug)
                        return item.slug
                    }
                }
            }
        }

        // 4. Fallback search by IMDb ID directly
        const idSearchRes = await fetch(`${API_BASE}/v1/api/tim-kiem?keyword=${imdbId}`)
        const idSearchData: any = await idSearchRes.json()
        if (idSearchData.data?.items?.length > 0) {
            const first = idSearchData.data.items[0]
            console.log(`[Mapping] SUCCESS (IMDb ID Match): ${first.slug}`)
            imdbCache.set(cacheKey, first.slug)
            return first.slug
        }

        console.log(`[Mapping] FAILED: No match found for ${imdbId} (${name})`)
    } catch (e) {
        console.error(`[Mapping] System Error:`, e)
    }
    return null
}

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
        } else if (id === 'kkphim_phim-moi') {
            apiUrl = `${API_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=1`
        } else if (id && id !== 'kkphim_search') {
            const listType = id.replace('kkphim_', '')
            apiUrl = `${API_BASE}/v1/api/danh-sach/${listType}?page=1`
            if (genreSlug) apiUrl += `&category=${genreSlug}`
            if (countrySlug) apiUrl += `&country=${countrySlug}`
        } else {
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
        const type = parts[0]
        const idRaw = parts[parts.length - 1].split('.json')[0]

        let slug = '', epSlug = '1'
        if (idRaw.startsWith('kkphim:')) {
            const bits = idRaw.split(':')
            slug = bits[1]
            epSlug = bits[3] || '1'
        } else if (idRaw.startsWith('tt')) {
            const bits = idRaw.split(':')
            const imdbId = bits[0]
            let season = 1
            if (type === 'series') {
                season = parseInt(bits[1]) || 1
                epSlug = bits[2] || '1'
            }

            const mappedSlug = await getSlugFromImdb(imdbId, type, season)
            if (mappedSlug) {
                slug = mappedSlug
            } else {
                return c.json({ streams: [] })
            }
        }

        if (!slug) return c.json({ streams: [] })

        try {
            console.log(`[Stream] Fetching: slug=${slug}, epSlug=${epSlug}`)
            const res = await fetch(`${API_BASE}/phim/${slug}`)
            const result: any = await res.json()
            const episodes = result.episodes || []

            const streams: any[] = []
            episodes.forEach((s: any) => {
                const ep = s.server_data.find((e: any) =>
                    e.slug === epSlug ||
                    e.name === epSlug ||
                    e.name === `Tập ${epSlug}` ||
                    e.name === `Tập 0${epSlug}` ||
                    (epSlug === '1' && e.name?.toLowerCase() === 'full')
                )

                if (ep?.link_m3u8) {
                    streams.push({
                        name: `KKPhim\n${s.server_name}`,
                        title: `${result.movie.name}\n${ep.name} [${result.movie.quality || 'FHD'}]`,
                        url: ep.link_m3u8
                    })
                }
            })
            return c.json({ streams })
        } catch (e) {
            console.error(`[Stream] Error:`, e)
            return c.json({ streams: [] })
        }
    }

    return c.text('Not Found', 404)
})

export default app
