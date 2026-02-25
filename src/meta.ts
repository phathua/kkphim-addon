import { API_BASE, IMG_BASE } from './utils/metadata'
import { mask } from './proxy'

export async function handleMeta(type: string, id: string, origin: string) {
    const slug = id.includes(':') ? id.split(':')[1] : id

    try {
        const res = await fetch(`${API_BASE}/phim/${slug}`)
        const result: any = await res.json()
        const item = result.movie
        if (!item) return { meta: {} }

        const fixImg = (u: string) => u ? (u.startsWith('http') ? u : `${IMG_BASE}/${u}`) : ''
        const maskImg = (u: string) => {
            const fullUrl = fixImg(u)
            if (!fullUrl) return ''
            const filename = (fullUrl.split('/').pop() || 'thumb.jpg').split('?')[0]
            return `${origin}/p/i/${mask(fullUrl)}/${filename}`
        }

        const meta: any = {
            id: `kkphim:${item.slug}`,
            type: (item.type === 'series' || (result.episodes && result.episodes[0]?.server_data.length > 1)) ? 'series' : 'movie',
            name: item.name,
            poster: maskImg(item.thumb_url),
            background: maskImg(item.poster_url),
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

        return { meta }
    } catch (e) {
        return { meta: {} }
    }
}
