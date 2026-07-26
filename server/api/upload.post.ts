import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createUploadHandler } from '../modules/files/delivery/upload-handler'

const handleUpload = createUploadHandler({
  home: homedir(),
  mkdir: path => mkdir(path, { recursive: true }),
  writeFile,
})

export default defineEventHandler(async (event) => {
  await requireBitveinsSession(event)

  return handleUpload({
    contentLength: getRequestHeader(event, 'content-length'),
    multipart: await readMultipartFormData(event),
  })
})
