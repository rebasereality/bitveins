import { createReadStream, existsSync, statSync } from 'node:fs'
import { ZipArchive } from 'archiver'
import { createDownloadHandler } from '../modules/files/delivery/download-handler'
import { useBitveinsContainer } from '../composition/bitveins-container'

const sessions = useBitveinsContainer().sessions
const handleDownload = createDownloadHandler({
  createDirectoryStream(path) {
    const archive = new ZipArchive({
      zlib: { level: 9 },
    })
    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') {
        console.warn('Archiver warning:', error)
        return
      }
      throw error
    })
    archive.on('error', (error) => {
      throw error
    })
    archive.directory(path, false)
    void archive.finalize()
    return archive
  },
  createFileStream: createReadStream,
  exists: existsSync,
  normalizePath: path => sessions.normalizePath(path),
  stat: statSync,
})

export default defineEventHandler(event => handleDownload(
  getQuery(event),
  {
    sendStream: stream => sendStream(event, stream),
    setHeader: (name, value) => setHeader(event, name, value),
  },
))
