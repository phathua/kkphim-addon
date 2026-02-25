import { API_BASE, IMG_BASE, GENRES, COUNTRIES, ensureMetadata } from './utils/metadata'

export async function handleCatalog(type: string, id: string, extra: string) {
    await ensureMetadata()
    let searchQuery = '', genreSlug = '', countrySlug = '', year = '', skip = 0
    if (extra) {
        extra.split('&').forEach(p => {
            const [k, v] = p.split('=')
            if (k === 'search') searchQuery = v
            if (k === 'genre') genreSlug = GENRES.find(g => g.name === v)?.slug || ''
            if (k === 'country') countrySlug = COUNTRIES.find(c => c.name === v)?.slug || ''
            if (k === 'year') year = v
            if (k === 'skip') skip = parseInt(v) || 0
        })
    }

    // V3 (Phim mới) is fixed at 24 items per page, V1 (Unified) supports 'limit'
    const limit = 48
    const page = Math.floor(skip / limit) + 1

    const v3Limit = 24
    const v3Page = Math.floor(skip / v3Limit) + 1

    console.log(`[KKPhim Catalog] type=${type}, id=${id}, extra=${extra}, page=${page}, limit=${limit}`)

    let apiUrl = ''
    let isV3 = false

    const listMap: Record<string, string> = {
        'kkphim_phim-bo': 'phim-bo',
        'kkphim_phim-le': 'phim-le',
        'kkphim_tv-shows': 'tv-shows',
        'kkphim_hoat-hinh': 'hoat-hinh'
    }

    const listType = listMap[id]

    if (searchQuery) {
        apiUrl = `${API_BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&page=${page}`
    } else if (listType) {
        apiUrl = `${API_BASE}/v1/api/danh-sach/${listType}?page=${page}&limit=${limit}&sort_field=modified.time&sort_type=desc`
        if (genreSlug) apiUrl += `&category=${genreSlug}`
        if (countrySlug) apiUrl += `&country=${countrySlug}`
        if (year) apiUrl += `&year=${year}`
    } else if (id === 'kkphim_phim-moi') {
        if (genreSlug || countrySlug || year) {
            if (countrySlug) {
                apiUrl = `${API_BASE}/v1/api/quoc-gia/${countrySlug}?page=${page}&limit=${limit}`
                if (genreSlug) apiUrl += `&category=${genreSlug}`
                if (year) apiUrl += `&year=${year}`
            } else if (genreSlug) {
                apiUrl = `${API_BASE}/v1/api/the-loai/${genreSlug}?page=${page}&limit=${limit}`
                if (year) apiUrl += `&year=${year}`
            } else {
                apiUrl = `${API_BASE}/v1/api/nam/${year}?page=${page}&limit=${limit}`
            }
        } else {
            apiUrl = `${API_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=${v3Page}`
            isV3 = true
        }
    } else {
        apiUrl = `${API_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=${v3Page}`
        isV3 = true
    }

    console.log(`[KKPhim Catalog] Final apiUrl=${apiUrl}`)

    try {
        let items = []
        let cdn = IMG_BASE

        if (isV3) {
            const fetchV3 = async (p: number) => {
                const res = await fetch(`${API_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=${p}`)
                return await res.json()
            }
            const [res1, res2] = await Promise.all([
                fetchV3(v3Page),
                (skip > 0) ? fetchV3(v3Page + 1).catch(() => ({})) : Promise.resolve({})
            ]) as [any, any]

            items = [...(res1.items || []), ...(res2.items || [])]
        } else {
            const res = await fetch(apiUrl)
            const result: any = await res.json()
            items = result.data?.items || []
            if (result.data?.APP_DOMAIN_CDN_IMAGE) {
                cdn = result.data.APP_DOMAIN_CDN_IMAGE
            }
        }

        const metas = items.map((item: any) => {
            let poster = item.poster_url || ''
            if (poster && !poster.startsWith('http')) {
                const cleanCDN = cdn.endsWith('/') ? cdn.slice(0, -1) : cdn
                const cleanPath = poster.startsWith('/') ? poster : `/${poster}`
                poster = `${cleanCDN}${cleanPath}`
            }

            let type = 'movie'
            if (item.type === 'series' || item.type === 'hoathinh' || item.type === 'tvshows') {
                type = 'series'
            }

            return {
                id: `kkphim:${item.slug}`,
                type: type,
                name: item.name,
                poster: poster,
                description: `${item.origin_name} (${item.year})`,
                releaseInfo: item.year?.toString()
            }
        })
        return { metas }
    } catch (e) {
        console.error(`[KKPhim Catalog] Error:`, e)
        return { metas: [] }
    }
}
