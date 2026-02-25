import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getManifest } from './manifest'
import { handleCatalog } from './catalog'
import { handleMeta } from './meta'
import { handleStream } from './stream'
import { handleProxy } from './proxy'

const app = new Hono()
app.use('*', cors())

app.get('/manifest.json', async (c) => c.json(await getManifest()))
app.get('/p/i/:hex/:file{.+}', (c) => handleProxy(c)) // Masked Proxy Image
app.get('/p/v/:hex/:file{.+}', (c) => handleProxy(c)) // Proxy Video Segments
app.get('/p/v/:hex', (c) => handleProxy(c))           // Proxy Master Playlist

// Wildcard route to handle all Stremio resources
app.get('/*', async (c) => {
    let path = decodeURIComponent(c.req.path)
    console.log(`[Request] ${path}`)

    if (path === '/manifest.json') return c.json(await getManifest())

    // Catalog handles
    if (path.startsWith('/catalog/')) {
        let parts = path.substring(9).split('/')
        if (parts.length < 2) return c.json({ metas: [] })

        const type = parts[0]
        let idRaw = parts[1] || ''
        let extraRaw = parts[2] || ''

        let id = idRaw.split('.json')[0]
        let extra = extraRaw.split('.json')[0]

        const origin = new URL(c.req.url).origin
        return c.json(await handleCatalog(type, id, extra, origin))
    }

    // Meta handles
    if (path.startsWith('/meta/')) {
        const parts = path.substring(6).split('/')
        let type = parts[0]
        let idRaw = parts.length > 1 ? parts[1] : parts[0]
        let id = idRaw.split('.json')[0]

        const origin = new URL(c.req.url).origin
        return c.json(await handleMeta(type, id, origin))
    }

    // Stream handles
    if (path.startsWith('/stream/')) {
        const parts = path.substring(8).split('/')
        if (parts.length < 2) return c.json({ streams: [] })

        const type = parts[0]
        let idRaw = parts[1] || ''
        let id = idRaw.split('.json')[0]

        const origin = new URL(c.req.url).origin
        return c.json(await handleStream(type, id, origin))
    }

    return c.text('Not Found', 404)
})

export default app
