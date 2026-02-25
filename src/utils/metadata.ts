export const API_BASE = 'https://phimapi.com'
export const IMG_BASE = 'https://phimimg.com'
export const ADDON_ID = 'com.nghienphim.kkphim.pro'
export const ADDON_LOGO = 'https://i.ibb.co/wr4VrPrN/kkphim-logo.png'

export let GENRES: { name: string, slug: string }[] = []
export let COUNTRIES: { name: string, slug: string }[] = []
let lastMetaUpdate = 0
const META_CACHE_TTL = 3600000 // 1 hour

export async function ensureMetadata() {
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
