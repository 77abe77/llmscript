// Supported Image MIME Types
export type AxImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'

// Supported Audio MIME Types
export type AxAudioMimeType =
  | 'audio/wav'
  | 'audio/mp3'
  | 'audio/aiff'
  | 'audio/aac'
  | 'audio/ogg'
  | 'audio/flac'

// Supported Video MIME Types
export type AxVideoMimeType =
  | 'video/mp4'
  | 'video/mpeg'
  | 'video/mov'
  | 'video/avi'
  | 'video/x-flv'
  | 'video/mpg'
  | 'video/webm'
  | 'video/wmv'
  | 'video/3gpp'

// Supported PDF MIME Type
export type AxPdfMimeType = 'application/pdf'

export type AxMediaMimeType =
  | AxImageMimeType
  | AxAudioMimeType
  | AxVideoMimeType
  | AxPdfMimeType

export type AxFileData = {
  mimeType: AxMediaMimeType
  fileUri: string
}

// base64-encoded
export type AxInlineData = {
  mimeType: AxMediaMimeType
  data: string
}

export type AxFieldValue =
  | string
  | number
  | boolean
  | object
  | null
  | undefined
  | AxFileData
  | AxInlineData
  | AxFieldValue[]

export type AxGenIn = { [key: string]: AxFieldValue }

export type AxGenOut = Record<string, AxFieldValue>

export type AxMessage =
  | { role: 'user'; values: AxGenIn }
  | { role: 'assistant'; values: AxGenOut }