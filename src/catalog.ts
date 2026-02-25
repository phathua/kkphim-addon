import { API_BASE, IMG_BASE, GENRES, COUNTRIES, ensureMetadata } from './utils/metadata'

export async function handleCatalog(type: string, id: string, extra: string) {
    await ensureMetadata()
    let searchQuery = '', genreSlug = '', countrySlug = '', skip = 0
    if (extra) {
        extra.split('&').forEach(p => {
            const [k, v] = p.split('=')
            if (k === 'search') searchQuery = v
            if (k === 'genre') genreSlug = GENRES.find(g => g.name === v)?.slug || ''
            if (k === 'country') countrySlug = COUNTRIES.find(c => c.name === v)?.slug || ''
            if (k === 'skip') skip = parseInt(v) || 0
        })
    }

    const page = Math.floor(skip / 24) + 1

    let apiUrl = ''
    if (searchQuery) {
        apiUrl = `${API_BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&page=${page}`
    } else if (id === 'kkphim_phim-moi') {
        apiUrl = `${API_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=${page}`
    } else if (id && id !== 'kkphim_search') {
        const listType = id.replace('kkphim_', '')
        apiUrl = `${API_BASE}/v1/api/danh-sach/${listType}?page=${page}`
        if (genreSlug) apiUrl += `&category=${genreSlug}`
        if (countrySlug) apiUrl += `&country=${countrySlug}`
    } else {
        apiUrl = `${API_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=${page}`
    }

    try {
        // Fetch two pages to provide a larger buffer (>20 items per scroll)
        const fetchPage = async (p: number) => {
            const url = apiUrl.replace(`page=${page}`, `page=${p}`)
            const res = await fetch(url)
            return await res.json()
        }

        const [result1, result2] = await Promise.all([
            fetchPage(page),
            fetchPage(page + 1).catch(() => ({}))
        ]) as [any, any]

        // Normalize items from different API versions
        let items = []
        if (result1.items) items = result1.items // V3
        else if (result1.data?.items) items = result1.data.items // V1

        if (result2.items) items = [...items, ...result2.items]
        else if (result2.data?.items) items = [...items, ...result2.data.items]

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
        return { metas }
    } catch (e) {
        return { metas: [] }
    }
}
