import { describe, expect, it } from 'vitest'
import { buildUploadDestinationPath, formatFileSize, formatPastedFileName } from '../../../app/utils/upload-path'

describe('upload-path utilities', () => {
  describe('buildUploadDestinationPath', () => {
    it('builds path with valid session and window names', () => {
      expect(buildUploadDestinationPath('my-session', 'main')).toBe('/tmp/bitveins/my-session/main')
    })

    it('sanitizes unsafe characters in session and window names', () => {
      expect(buildUploadDestinationPath('my session/1', 'tab:dev*')).toBe('/tmp/bitveins/my_session_1/tab_dev_')
    })

    it('falls back to default/general when names are empty or null', () => {
      expect(buildUploadDestinationPath(null, null)).toBe('/tmp/bitveins/default/general')
      expect(buildUploadDestinationPath('', '')).toBe('/tmp/bitveins/default/general')
    })
  })

  describe('formatPastedFileName', () => {
    it('generates timestamped filename for generic blob/image paste', () => {
      const mockBlob = new File(['dummy'], 'image.png', { type: 'image/png' })
      const formatted = formatPastedFileName(mockBlob)
      expect(formatted).toMatch(/^paste_\d{8}_\d{6}_\d{2}\.png$/)
    })

    it('preserves non-generic file names', () => {
      const mockFile = new File(['dummy'], 'document.pdf', { type: 'application/pdf' })
      expect(formatPastedFileName(mockFile)).toBe('document.pdf')
    })
  })

  describe('formatFileSize', () => {
    it('formats bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(512)).toBe('512 B')
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1572864)).toBe('1.5 MB')
    })
  })
})
