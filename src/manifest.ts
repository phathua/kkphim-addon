import { GENRES, COUNTRIES, ensureMetadata, ADDON_ID, ADDON_LOGO } from './utils/metadata'

export async function getManifest() {
    await ensureMetadata()
    const years = Array.from({ length: 26 }, (_, i) => (2026 - i).toString())
    const EXTRA_CATALOG = [
        { name: 'genre', options: GENRES.map(g => g.name), isRequired: false },
        { name: 'country', options: COUNTRIES.map(c => c.name), isRequired: false },
        { name: 'year', options: years, isRequired: false },
        { name: 'skip', isRequired: false }
    ]

    return {
        id: ADDON_ID,
        name: 'KKPhim Stremio Addon',
        logo: ADDON_LOGO,
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
