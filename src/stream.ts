import { API_BASE } from './utils/metadata'
import { getSlugFromImdb } from './utils/mapping'

export async function handleStream(type: string, idRaw: string) {
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
            return { streams: [] }
        }
    }

    if (!slug) return { streams: [] }

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
        return { streams }
    } catch (e) {
        console.error(`[Stream] Error:`, e)
        return { streams: [] }
    }
}
