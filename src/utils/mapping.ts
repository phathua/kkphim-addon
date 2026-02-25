import { API_BASE } from './metadata'

// Mapping cache
const imdbCache = new Map<string, string>()

export function decodeHtml(text: string): string {
    return text
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\u00a0/g, ' ') // non-breaking space
}

export async function getSlugFromImdb(imdbId: string, type: string, season?: number): Promise<string | null> {
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
                const data: any = await res.json()
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
