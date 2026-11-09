/**
 * GPT image generation for the Harness, with in-app configuration.
 *
 * Registers:
 * - `image_generate`  — text to image over `POST /v1/images/generations`.
 * - `image_edit`      — image + prompt over the multipart `POST /v1/images/edits`.
 * - `image_configure` — read or change base URL, key, model, defaults.
 * - Settings routes   — `/gpt-image-api/config`, `/models`, `/test`, `/gallery`, `/file`.
 *
 * Both tools write the returned bytes under `<workspace>/<outputDir>` and, when
 * the calling model route accepts image input, attach them to the conversation.
 * Credentials live in a per-profile JSON file, never in the bundle patch.
 *
 * The bundle is installed by path link, so it imports nothing outside Node's
 * builtins: host packages would not resolve from the linked checkout.
 *
 * @module dsh-plugin-gpt-image
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'gpt-image'

/** Services required by the tool; the web carrier is optional. */
export const inject = ['tools']

/** Sizes the GPT image family accepts. */
const SIZES = ['1024x1024', '1536x1024', '1024x1536', 'auto']

/** Quality levels the GPT image family accepts. */
const QUALITIES = ['auto', 'low', 'medium', 'high']

/** Background modes the GPT image family accepts. */
const BACKGROUNDS = ['auto', 'transparent', 'opaque']

/** Upper bound on one call, so a stray `n` cannot start an unbounded batch. */
const MAX_IMAGES = 4

/** How many gallery entries one request returns. */
const GALLERY_LIMIT = 60

/** Route table; each entry is an exact path served by this plugin. */
export const ROUTES = {
  config: '/gpt-image-api/config',
  models: '/gpt-image-api/models',
  test: '/gpt-image-api/test',
  gallery: '/gpt-image-api/gallery',
  file: '/gpt-image-api/file',
}

/** Largest accepted request body for the configuration route. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Prompt section registered with the Harness. Tool descriptions alone leave the
 * model free to draw with code (PIL/numpy/canvas), which is slow and does not
 * use the configured image model, so the policy states the rule every step.
 */
const IMAGE_POLICY = `## Image work
- When the user asks for a new picture, illustration, icon, poster, avatar, or any other visual asset, call \`image_generate\`.
- When the user asks to change an existing image (recolor, restyle, replace or remove an object, extend the frame), call \`image_edit\` with that file.
- Do not produce a picture by writing code — image libraries (PIL, numpy, opencv, sharp), ffmpeg filters, canvas, or hand-written SVG — unless the user explicitly asks for programmatic batch processing or pixel-exact operations that a generative model cannot express.
- If a call fails or times out, report the error and offer to retry. Never fall back to drawing or editing the picture with code.
- When \`image_generate\` or \`image_edit\` returns an image, show it and stop. Do not crop, diff, or otherwise inspect the result with code unless the user explicitly asks you to check a detail.
- If a request needs both, generate or edit the image with the tool first, then use code only for non-visual steps such as resizing files or building a contact sheet.`

/** Defaults used when neither the stored options nor the bundle row set a field. */
const DEFAULTS = {
  baseUrl: 'https://ai.stjapi.com',
  model: 'gpt-image-2.6-flare',
  size: '1024x1024',
  quality: 'auto',
  responseFormat: 'b64',
  background: 'auto',
  outputDir: 'gpt-images',
  timeoutMs: 240000,
}

/** Output shape of one stored image attachment, mirroring the host's image value schema. */
const IMAGE_VALUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
  properties: {
    attachmentId: { type: 'string' },
    mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
    bytes: { type: 'integer' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    name: { type: 'string' },
  },
}

/** One generated image as both tools report it. */
const IMAGE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'relativePath', 'mediaType', 'bytes'],
  properties: {
    path: { type: 'string' },
    relativePath: { type: 'string' },
    mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
    bytes: { type: 'integer' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    sourceUrl: { type: 'string' },
    image: IMAGE_VALUE_SCHEMA,
  },
}

/** Shared result envelope for both image tools. */
const IMAGE_TOOL_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['model', 'size', 'images'],
  properties: {
    model: { type: 'string' },
    size: { type: 'string' },
    prompt: { type: 'string' },
    source: { type: 'string' },
    images: { type: 'array', items: IMAGE_RESULT_SCHEMA },
  },
}

/** Configuration state returned by both callers. */
const STATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['baseUrl', 'model', 'size', 'quality', 'background', 'outputDir', 'hasApiKey'],
  properties: {
    baseUrl: { type: 'string' },
    model: { type: 'string' },
    size: { type: 'string' },
    quality: { type: 'string' },
    background: { type: 'string' },
    outputDir: { type: 'string' },
    hasApiKey: { type: 'boolean' },
    apiKeyHint: { type: 'string' },
    optionsFile: { type: 'string' },
  },
}

/**
 * Read a non-empty trimmed string or undefined.
 * @param value - the candidate value.
 * @returns the trimmed string, or undefined when it is absent or blank.
 */
function text(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** Location of the per-profile options file holding the user's own credentials. */
function optionsFile() {
  const directory = text(process.env.DSH_PROFILE_DIR) ?? join(homedir(), '.dsh')
  return join(directory, 'gpt-image.options.json')
}

/**
 * Read the stored options, tolerating a missing, BOM-prefixed, or malformed file.
 * @returns the stored object, or an empty object.
 */
async function readStoredOptions() {
  try {
    const raw = await readFile(optionsFile(), 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/u, ''))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Persist the stored options.
 * @param options - the complete options object to write.
 */
async function writeStoredOptions(options) {
  const file = optionsFile()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(options, null, 2)}\n`, 'utf8')
}

/**
 * Merge bundle-row defaults with environment and stored credentials.
 * @param config - the bundle row's raw configuration.
 * @returns the layered defaults.
 */
function bundleDefaults(config) {
  return {
    baseUrl: text(config?.baseUrl) ?? DEFAULTS.baseUrl,
    apiKey: text(config?.apiKey) ?? text(process.env.GPT_IMAGE_API_KEY) ?? '',
    model: text(config?.model) ?? DEFAULTS.model,
    size: text(config?.size) ?? DEFAULTS.size,
    quality: QUALITIES.includes(text(config?.quality)) ? text(config.quality) : DEFAULTS.quality,
    background: BACKGROUNDS.includes(text(config?.background)) ? text(config.background) : DEFAULTS.background,
    responseFormat: text(config?.responseFormat) === 'url' ? 'url' : DEFAULTS.responseFormat,
    outputDir: text(config?.outputDir) ?? DEFAULTS.outputDir,
    timeoutMs: Number.isFinite(config?.timeoutMs) ? config.timeoutMs : DEFAULTS.timeoutMs,
  }
}

/**
 * Resolve the effective settings: stored values win over the bundle row.
 * @param config - the bundle row's raw configuration.
 * @returns the settings every operation uses.
 */
async function currentSettings(config) {
  const defaults = bundleDefaults(config)
  const stored = await readStoredOptions()
  const pick = (key, allowed) => {
    const value = text(stored[key])
    return value !== undefined && (allowed === undefined || allowed.includes(value)) ? value : undefined
  }
  return {
    baseUrl: pick('baseUrl') ?? defaults.baseUrl,
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey.trim() : defaults.apiKey,
    model: pick('model') ?? defaults.model,
    size: pick('size', SIZES) ?? defaults.size,
    quality: pick('quality', QUALITIES) ?? defaults.quality,
    background: pick('background', BACKGROUNDS) ?? defaults.background,
    responseFormat: pick('responseFormat', ['b64', 'url']) ?? defaults.responseFormat,
    outputDir: pick('outputDir') ?? defaults.outputDir,
    timeoutMs: Number.isFinite(stored.timeoutMs) ? stored.timeoutMs : defaults.timeoutMs,
  }
}

/**
 * Project settings onto the JSON the UI and the agent see; the key itself never leaves the Host.
 * @param settings - the effective settings.
 * @returns the public state.
 */
function publicState(settings) {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    size: settings.size,
    quality: settings.quality,
    background: settings.background,
    outputDir: settings.outputDir,
    hasApiKey: settings.apiKey.length > 0,
    apiKeyHint: settings.apiKey.length >= 4 ? `••••${settings.apiKey.slice(-4)}` : '',
    optionsFile: optionsFile(),
  }
}

/**
 * Validate and persist a configuration change.
 * @param config - the bundle row's raw configuration.
 * @param patch - the fields to change; `clearApiKey` removes the stored key.
 * @returns the new public state.
 * @throws when a supplied value is invalid.
 */
async function configure(config, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('expected a JSON object of configuration fields')
  }
  const stored = { ...(await readStoredOptions()) }
  let changed = false

  if (patch.clearApiKey === true) {
    if (Object.hasOwn(stored, 'apiKey')) {
      delete stored.apiKey
      changed = true
    }
  } else if (Object.hasOwn(patch, 'apiKey')) {
    const apiKey = typeof patch.apiKey === 'string' ? patch.apiKey.trim() : ''
    if (apiKey.length === 0) throw new Error('apiKey must be a non-empty string; send clearApiKey to remove a saved key')
    if (apiKey.length > 400) throw new Error('apiKey is longer than 400 characters')
    stored.apiKey = apiKey
    changed = true
  }

  if (Object.hasOwn(patch, 'baseUrl')) {
    const baseUrl = text(patch.baseUrl)
    if (baseUrl === undefined) throw new Error('baseUrl must be a non-empty http(s) URL')
    let parsed
    try {
      parsed = new URL(baseUrl)
    } catch {
      throw new Error(`baseUrl is not a valid URL: ${baseUrl}`)
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('baseUrl must start with http:// or https://')
    stored.baseUrl = baseUrl.replace(/\/+$/u, '')
    changed = true
  }

  if (Object.hasOwn(patch, 'model')) {
    const model = text(patch.model)
    if (model === undefined) throw new Error('model must be a non-empty string')
    if (model.length > 200) throw new Error('model is longer than 200 characters')
    stored.model = model
    changed = true
  }

  if (Object.hasOwn(patch, 'size')) {
    const size = text(patch.size)
    if (size === undefined || !SIZES.includes(size)) throw new Error(`size must be one of ${SIZES.join(', ')}`)
    stored.size = size
    changed = true
  }

  if (Object.hasOwn(patch, 'quality')) {
    const quality = text(patch.quality)
    if (quality === undefined || !QUALITIES.includes(quality)) throw new Error(`quality must be one of ${QUALITIES.join(', ')}`)
    stored.quality = quality
    changed = true
  }

  if (Object.hasOwn(patch, 'background')) {
    const background = text(patch.background)
    if (background === undefined || !BACKGROUNDS.includes(background)) throw new Error(`background must be one of ${BACKGROUNDS.join(', ')}`)
    stored.background = background
    changed = true
  }

  if (Object.hasOwn(patch, 'outputDir')) {
    const outputDir = text(patch.outputDir)
    if (outputDir === undefined) throw new Error('outputDir must be a non-empty relative directory')
    if (isAbsolute(outputDir) || outputDir.split(/[\\/]+/u).includes('..')) {
      throw new Error('outputDir must be a relative path without ".." segments')
    }
    stored.outputDir = outputDir
    changed = true
  }

  if (changed) await writeStoredOptions(stored)
  return publicState(await currentSettings(config))
}

/**
 * Remember the workspace a generation wrote into, so session-less routes can
 * list and serve those files after a restart.
 * @param cwd - the absolute workspace directory.
 */
async function rememberWorkspace(cwd) {
  try {
    const stored = await readStoredOptions()
    if (stored.lastWorkspace === cwd) return
    stored.lastWorkspace = cwd
    await writeStoredOptions(stored)
  } catch {
    // A gallery hint is not worth failing a generation over.
  }
}

/**
 * The workspace root used by session-less routes: the remembered one when it
 * still exists, else the deployment default.
 * @param ctx - the plugin context.
 * @returns an absolute directory.
 */
async function galleryRoot(ctx) {
  const remembered = text((await readStoredOptions()).lastWorkspace)
  return remembered !== undefined && isAbsolute(remembered) ? remembered : defaultCwd(ctx)
}

/**
 * Identify the media type declared by the file signature.
 * @param data - the decoded image bytes.
 * @returns a supported image media type; PNG when nothing matches.
 */
function sniffMediaType(data) {
  if (data.byteLength >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.byteLength >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.byteLength >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return 'image/png'
}

/**
 * Read pixel dimensions from the header of a PNG.
 * @param data - the decoded image bytes.
 * @param mediaType - the sniffed media type.
 * @returns the dimensions, or undefined when they cannot be read without a decoder.
 */
function imageSize(data, mediaType) {
  if (mediaType === 'image/png' && data.byteLength >= 24) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
  }
  return undefined
}

/**
 * Build a filesystem-safe slug out of a prompt.
 * @param prompt - the user prompt.
 * @returns a lowercase ASCII slug, or `image` when nothing survives.
 */
function slug(prompt) {
  const cleaned = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40)
    .replace(/-+$/u, '')
  return cleaned.length > 0 ? cleaned : 'image'
}

/** Render the current time as a filename-safe stamp. */
function stamp() {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

/** Wait for a delay, aborting with the caller's signal. */
function delay(ms, signal) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(resolvePromise, ms)
    if (signal !== undefined && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        rejectPromise(signal.reason ?? new Error('aborted'))
      }, { once: true })
    }
  })
}

/**
 * Bound one request by the plugin timeout while still honouring cancellation.
 * @param signal - the calling tool's abort signal.
 * @param timeoutMs - the configured ceiling in milliseconds.
 * @returns the signal to pass to fetch.
 */
function withTimeout(signal, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return signal
  const timeout = AbortSignal.timeout(timeoutMs)
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout])
  return signal
}

/**
 * fetch with bounded retries for rate limits and transient server failures.
 * @param url - the request URL.
 * @param init - fetch options.
 * @param signal - cancellation signal.
 * @param retries - retries after the first attempt.
 * @returns the final response, successful or not.
 */
async function fetchWithRetry(url, init, signal, retries = 2) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal })
      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt < retries) {
        const header = Number(response.headers.get('retry-after'))
        const wait = Number.isFinite(header) && header > 0 ? Math.min(header * 1000, 15000) : 1000 * (2 ** attempt)
        await delay(wait, signal)
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (error?.name === 'AbortError' || attempt >= retries) throw error
      await delay(1000 * (2 ** attempt), signal)
    }
  }
  throw lastError ?? new Error('request failed')
}

/**
 * Describe a failed image request, calling out the timeout case explicitly.
 * @param endpoint - the request URL.
 * @param error - the thrown error.
 * @param timeoutMs - the configured ceiling in milliseconds.
 * @returns the message for the model and the user.
 */
function describeFetchFailure(endpoint, error, timeoutMs) {
  if (error?.name === 'AbortError') {
    const seconds = Math.round((Number.isFinite(timeoutMs) ? timeoutMs : 240000) / 1000)
    return `the image API did not answer within ${seconds}s at ${endpoint}; the provider may still have produced the image — retry, or check its web gallery`
  }
  return `could not reach the image API at ${endpoint}: ${error instanceof Error ? error.message : String(error)}`
}

/**
 * Resolve an endpoint under the configured base URL.
 * @param baseUrl - the API base URL.
 * @param path - the endpoint path.
 * @returns the absolute URL.
 */
function endpointFor(baseUrl, path) {
  try {
    return new URL(path, baseUrl).toString()
  } catch {
    throw new Error(`invalid image API base URL: ${baseUrl}`)
  }
}

/**
 * The deployment's default directory, used by routes that run without a session.
 * @param ctx - the plugin context.
 * @returns an absolute directory.
 */
function defaultCwd(ctx) {
  const fallback = ctx.get('workingDirectory')?.defaultDirectory
  return typeof fallback === 'string' && fallback.length > 0 ? fallback : process.cwd()
}

/**
 * Resolve the calling session's workspace root.
 * @param ctx - the plugin context.
 * @param exec - the tool execution context.
 * @returns an absolute directory to write generated images into.
 */
function resolveWorkingDirectory(ctx, exec) {
  const workingDirectory = ctx.get('workingDirectory')
  const session = exec.agent?.session
  if (workingDirectory !== undefined && session !== undefined) {
    try {
      return workingDirectory.get(session)
    } catch {
      // Fall through to the deployment default.
    }
  }
  return defaultCwd(ctx)
}

/**
 * Whether the calling model route declares image input, so an image block cannot
 * break a text-only request. A resolved route is required, mirroring `read_image`.
 * @param ctx - the plugin context supplying the optional `llm` service.
 * @param exec - the tool execution context supplying the calling agent.
 * @returns true only for a route that explicitly accepts images.
 */
async function routeAcceptsImageInput(ctx, exec) {
  try {
    const routed = exec.agent?.session?.requestHeader?.()?.config
    const provider = routed?.provider ?? exec.agent?.options?.provider
    const model = routed?.model ?? exec.agent?.options?.model
    const llm = ctx.get('llm')
    if (provider === undefined || model === undefined || llm === undefined) return false
    const info = await llm.resolveModelInfo(provider, model, exec.signal)
    return Array.isArray(info?.inputModalities) && info.inputModalities.includes('image')
  } catch {
    return false
  }
}

/**
 * Read one image API response into its `data` items.
 * @param response - the fetch response.
 * @returns the image items.
 */
async function readImageResponse(response) {
  const raw = await response.text()
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    body = undefined
  }
  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message ?? raw.slice(0, 300)
    throw new Error(`image API ${response.status} ${response.statusText}: ${detail}`)
  }
  if (body === undefined) throw new Error('the image API returned a non-JSON response')
  const items = Array.isArray(body?.data) ? body.data : []
  if (items.length === 0) throw new Error('the image API returned no image data')
  return items
}

/**
 * Text to image over the JSON endpoint.
 * @param settings - effective endpoint, credential, and defaults.
 * @param request - resolved call fields.
 * @param signal - cancellation and timeout signal.
 * @returns the response image items.
 */
async function requestGeneration(settings, request, signal) {
  if (settings.apiKey.length === 0) {
    throw new Error('no image API key configured: set one in Settings → GPT 生图, or call image_configure')
  }
  const endpoint = endpointFor(settings.baseUrl, '/v1/images/generations')
  const body = {
    model: request.model,
    prompt: request.prompt,
    n: request.n,
    size: request.size,
    // Inline base64 keeps the transfer on the API host. A `url` response is small
    // but adds a second hop to a CDN that some networks stall on, so it is opt-in.
    response_format: settings.responseFormat === 'url' ? 'url' : 'b64_json',
  }
  if (request.quality !== 'auto') body.quality = request.quality
  if (request.background !== 'auto') body.background = request.background
  let response
  try {
    response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${settings.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    }, signal)
  } catch (error) {
    throw new Error(describeFetchFailure(endpoint, error, settings.timeoutMs))
  }
  return readImageResponse(response)
}

/**
 * Image + prompt over the multipart edit endpoint.
 * @param settings - effective endpoint, credential, and defaults.
 * @param request - resolved call fields, including the source image path.
 * @param signal - cancellation and timeout signal.
 * @returns the response image items.
 */
async function requestEdit(settings, request, signal) {
  if (settings.apiKey.length === 0) {
    throw new Error('no image API key configured: set one in Settings → GPT 生图, or call image_configure')
  }
  const endpoint = endpointFor(settings.baseUrl, '/v1/images/edits')
  const bytes = await readFile(request.imagePath)
  const mediaType = sniffMediaType(bytes)
  const form = new FormData()
  form.append('model', request.model)
  form.append('prompt', request.prompt)
  form.append('size', request.size)
  form.append('response_format', settings.responseFormat === 'url' ? 'url' : 'b64_json')
  if (request.n > 1) form.append('n', String(request.n))
  if (request.quality !== 'auto') form.append('quality', request.quality)
  if (request.background !== 'auto') form.append('background', request.background)
  form.append('image', new Blob([new Uint8Array(bytes)], { type: mediaType }), basename(request.imagePath))
  let response
  try {
    response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${settings.apiKey}`, accept: 'application/json' },
      body: form,
    }, signal)
  } catch (error) {
    throw new Error(describeFetchFailure(endpoint, error, settings.timeoutMs))
  }
  return readImageResponse(response)
}

/**
 * Decode one response item: a small URL first, then an inline base64 body.
 * @param item - one entry of the response `data` array.
 * @param signal - cancellation and timeout signal.
 * @returns the decoded image bytes.
 */
async function decodeItem(item, signal) {
  if (typeof item?.url === 'string' && item.url.length > 0) {
    // The generation budget is already spent by the time the URL arrives, so the
    // download keeps its own deadline instead of inheriting the near-expired one.
    const downloadSignal = AbortSignal.timeout(120000)
    try {
      const response = await fetchWithRetry(item.url, {}, downloadSignal, 2)
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      throw new Error(`the image was generated but downloading it failed (${error instanceof Error ? error.message : String(error)}); the file is still available at ${item.url}`)
    }
  }
  if (typeof item?.b64_json === 'string' && item.b64_json.length > 0) return Buffer.from(item.b64_json, 'base64')
  throw new Error('the image API returned neither url nor b64_json')
}

/**
 * Persist response items as workspace files and, when possible, attachments.
 * @param options - ctx, exec, items, filename prefix, and output settings.
 * @returns the reported image entries.
 */
async function persistImages(options) {
  const { ctx, exec, items, prefixSource, settings, signal } = options
  const cwd = resolveWorkingDirectory(ctx, exec)
  await rememberWorkspace(cwd)
  const directory = resolve(cwd, settings.outputDir)
  await mkdir(directory, { recursive: true })
  const attachments = (await routeAcceptsImageInput(ctx, exec)) ? ctx.get('attachments') : undefined
  const prefix = `${stamp()}-${slug(prefixSource)}`
  const images = []
  for (let index = 0; index < items.length; index += 1) {
    const data = await decodeItem(items[index], signal)
    const mediaType = sniffMediaType(data)
    const extension = mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : 'png'
    const storedName = `${prefix}-${index + 1}.${extension}`
    const file = join(directory, storedName)
    await writeFile(file, data)
    const entry = {
      path: file,
      relativePath: relative(cwd, file),
      mediaType,
      bytes: data.byteLength,
    }
    const dimensions = imageSize(data, mediaType)
    if (dimensions !== undefined) {
      entry.width = dimensions.width
      entry.height = dimensions.height
    }
    if (typeof items[index]?.url === 'string' && items[index].url.length > 0) entry.sourceUrl = items[index].url
    if (attachments !== undefined) {
      try {
        const ref = await attachments.saveImage({ data: new Uint8Array(data), mediaType, name: storedName })
        entry.image = {
          attachmentId: ref.attachmentId,
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          ...(ref.name === undefined ? {} : { name: ref.name }),
        }
      } catch {
        // The workspace file is the deliverable; a refused attachment only costs the inline preview.
      }
    }
    images.push(entry)
  }
  return images
}

/**
 * Render an image tool outcome as the model-facing envelope plus its image blocks.
 * @param value - the tool's structured result.
 * @returns the content blocks for the conversation.
 */
function renderImages(value) {
  const blocks = [{
    type: 'text',
    text: `${value.images.length} image(s) with ${value.model} at ${value.size}${value.source !== undefined ? ` (source: ${value.source})` : ''}.\n${value.images.map(image => `<path>${image.path}</path>`).join('\n')}`,
  }]
  for (const image of value.images) {
    const scaled = image.width !== undefined && image.height !== undefined ? `, ${image.width}x${image.height} px` : ''
    blocks.push({
      type: 'text',
      text: `<path>${image.path}</path>\n<type>image</type>\n<content>\n${image.mediaType} image${scaled}, ${image.bytes} bytes\n</content>`,
    })
    if (image.image !== undefined) {
      blocks.push({
        type: 'image',
        attachment: {
          attachmentId: image.image.attachmentId,
          mediaType: image.image.mediaType,
          bytes: image.image.bytes,
          width: image.image.width,
          height: image.image.height,
          ...(image.image.name === undefined ? {} : { name: image.image.name }),
        },
      })
    }
  }
  return blocks
}

/**
 * Read a bounded JSON request body.
 * @param req - the inbound request.
 * @returns the parsed JSON value.
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  if (total === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('request body is not valid JSON')
  }
}

/**
 * Answer one request with JSON.
 * @param res - the server response.
 * @param status - the HTTP status code.
 * @param value - the JSON value to send.
 */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

/**
 * List the models the configured endpoint serves for this key.
 * @param settings - effective settings.
 * @param signal - cancellation signal.
 * @returns the model ids.
 */
async function listModels(settings, signal) {
  const endpoint = endpointFor(settings.baseUrl, '/v1/models')
  const response = await fetchWithRetry(endpoint, {
    headers: { authorization: `Bearer ${settings.apiKey}`, accept: 'application/json' },
  }, signal, 1)
  const raw = await response.text()
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    body = undefined
  }
  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message ?? raw.slice(0, 200)
    throw new Error(`models request failed (${response.status}): ${detail}`)
  }
  const rows = Array.isArray(body?.data) ? body.data : []
  return rows.map(row => (typeof row?.id === 'string' ? row.id : undefined)).filter(id => id !== undefined)
}

/**
 * Serve configuration reads and writes.
 * @param req - the inbound request.
 * @param res - the server response.
 * @param config - the bundle row's raw configuration.
 */
async function handleConfigRoute(req, res, config) {
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      sendJson(res, 200, publicState(await currentSettings(config)))
      return
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      sendJson(res, 200, await configure(config, await readJsonBody(req)))
      return
    }
    res.setHeader('allow', 'GET, POST')
    sendJson(res, 405, { error: `method ${req.method ?? 'UNKNOWN'} is not allowed` })
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Serve the model list for the Settings page.
 * @param req - the inbound request.
 * @param res - the server response.
 * @param config - the bundle row's raw configuration.
 */
async function handleModelsRoute(req, res, config) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET')
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const settings = await currentSettings(config)
    if (settings.apiKey.length === 0) throw new Error('no API key configured yet')
    const models = await listModels(settings, AbortSignal.timeout(20000))
    sendJson(res, 200, { models, count: models.length })
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Probe the endpoint with the stored credentials, reporting latency.
 * @param req - the inbound request.
 * @param res - the server response.
 * @param config - the bundle row's raw configuration.
 */
async function handleTestRoute(req, res, config) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST')
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  const started = Date.now()
  try {
    const settings = await currentSettings(config)
    if (settings.apiKey.length === 0) throw new Error('no API key configured yet')
    const models = await listModels(settings, AbortSignal.timeout(20000))
    sendJson(res, 200, {
      ok: true,
      latencyMs: Date.now() - started,
      baseUrl: settings.baseUrl,
      count: models.length,
      models: models.slice(0, 40),
    })
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * List the most recent images in the configured output directory.
 * @param req - the inbound request.
 * @param res - the server response.
 * @param ctx - the plugin context.
 * @param config - the bundle row's raw configuration.
 */
async function handleGalleryRoute(req, res, ctx, config) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET')
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const settings = await currentSettings(config)
    const directory = resolve(await galleryRoot(ctx), settings.outputDir)
    const entries = await readdir(directory, { withFileTypes: true })
    const files = entries.filter(entry => entry.isFile() && /\.(png|jpe?g|webp)$/iu.test(entry.name))
    const rows = await Promise.all(files.map(async entry => {
      const info = await stat(join(directory, entry.name))
      return { name: entry.name, bytes: info.size, modifiedAt: info.mtimeMs }
    }))
    rows.sort((left, right) => right.modifiedAt - left.modifiedAt)
    sendJson(res, 200, { directory, files: rows.slice(0, GALLERY_LIMIT) })
  } catch (error) {
    sendJson(res, 200, { files: [], error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Serve one generated image by file name.
 * @param req - the inbound request.
 * @param res - the server response.
 * @param ctx - the plugin context.
 * @param config - the bundle row's raw configuration.
 */
async function handleFileRoute(req, res, ctx, config) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET')
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const name = url.searchParams.get('name') ?? ''
    if (!/^[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/iu.test(name)) {
      sendJson(res, 400, { error: 'invalid file name' })
      return
    }
    const settings = await currentSettings(config)
    const directory = resolve(await galleryRoot(ctx), settings.outputDir)
    const file = resolve(directory, name)
    if (dirname(file) !== directory) {
      sendJson(res, 403, { error: 'path escapes the output directory' })
      return
    }
    const bytes = await readFile(file)
    const lower = name.toLowerCase()
    const mediaType = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : lower.endsWith('.webp') ? 'image/webp' : 'image/png'
    res.statusCode = 200
    res.setHeader('content-type', mediaType)
    res.setHeader('cache-control', 'no-store')
    if (url.searchParams.get('download') === '1') {
      res.setHeader('content-disposition', `attachment; filename="${name}"`)
    }
    res.setHeader('content-length', bytes.byteLength)
    res.end(bytes)
  } catch (error) {
    sendJson(res, 404, { error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Shared parameter schema for the fields both image tools accept.
 * @param extra - additional properties, such as the source image for edits.
 * @returns the parameters JSON schema.
 */
function imageToolParameters(extra) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      prompt: {
        type: 'string',
        description: 'What the resulting image should show. State subject, style, lighting, composition, and any text that must appear.',
      },
      size: {
        type: 'string',
        enum: [...SIZES],
        description: 'Image dimensions: 1024x1024 square, 1536x1024 landscape, 1024x1536 portrait, or auto.',
      },
      model: { type: 'string', description: 'Image model id served by the endpoint; defaults to the configured model.' },
      quality: { type: 'string', enum: [...QUALITIES], description: 'Render quality; auto uses the endpoint default.' },
      background: { type: 'string', enum: [...BACKGROUNDS], description: 'Background handling; transparent needs a supporting model.' },
      n: { type: 'integer', default: 1, description: `How many images to produce in one call (1-${MAX_IMAGES}).` },
      ...(extra ?? {}),
    },
    required: ['prompt', ...(extra?.image === undefined ? [] : ['image'])],
  }
}

/**
 * Resolve the call's effective fields, falling back to configured defaults.
 * @param args - the tool arguments.
 * @param settings - effective settings.
 * @returns the resolved fields.
 */
function resolveCall(args, settings) {
  const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
  if (prompt.length === 0) throw new Error('prompt must be a non-empty string')
  const model = (typeof args?.model === 'string' ? args.model.trim() : '') || settings.model
  const size = (typeof args?.size === 'string' ? args.size.trim() : '') || settings.size
  if (!SIZES.includes(size)) throw new Error(`size must be one of ${SIZES.join(', ')}`)
  const quality = (typeof args?.quality === 'string' ? args.quality.trim() : '') || settings.quality
  if (!QUALITIES.includes(quality)) throw new Error(`quality must be one of ${QUALITIES.join(', ')}`)
  const background = (typeof args?.background === 'string' ? args.background.trim() : '') || settings.background
  if (!BACKGROUNDS.includes(background)) throw new Error(`background must be one of ${BACKGROUNDS.join(', ')}`)
  const requested = args?.n === undefined ? 1 : args.n
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_IMAGES) {
    throw new Error(`n must be an integer between 1 and ${MAX_IMAGES}`)
  }
  return { prompt, model, size, quality, background, n: requested }
}

/**
 * Register both image tools, the configuration tool, and the Settings routes.
 * @param ctx - the plugin context.
 * @param config - the bundle row's raw configuration.
 */
export function apply(ctx, config) {
  ctx.tools.register({
    name: 'image_generate',
    description: 'Generate images with the GPT image API and save them as files in the workspace. Use it whenever the user asks for a picture, illustration, icon, photo, or poster instead of describing the image in text. Returns the saved absolute file paths; when the current model accepts image input the images are also attached to the conversation. Present the returned images instead of verifying them with extra tool calls.',
    parameters: imageToolParameters(),
    output: {
      schema: IMAGE_TOOL_OUTPUT,
      render: (_args, value) => renderImages(value),
      presentationMeta: (_args, value) => ({ paths: value.images.map(image => image.path) }),
    },
    isConcurrencySafe: () => false,
    presentCall(args) {
      const prompt = typeof args?.prompt === 'string' ? args.prompt : ''
      const short = prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt
      return { card: 'generic', title: `Generate image: ${short.length > 0 ? short : '(no prompt yet)'}`, kind: 'other', rawInput: args }
    },
    async execute(args, exec) {
      const settings = await currentSettings(config)
      const call = resolveCall(args, settings)
      const signal = withTimeout(exec.signal, settings.timeoutMs)
      const items = await requestGeneration(settings, call, signal)
      const images = await persistImages({ ctx, exec, items, prefixSource: call.prompt, settings, signal })
      return { model: call.model, size: call.size, prompt: call.prompt, images }
    },
  })

  ctx.tools.register({
    name: 'image_edit',
    description: 'Edit an existing image with the GPT image API (multipart POST /v1/images/edits) following a prompt that describes the change. Use it for "make this blue", style transfer, object replacement, or any image-to-image request where the user supplies a source picture. Writes the result into the workspace and returns its path. The returned image is final: present it instead of cropping or diffing it to check the result.',
    parameters: imageToolParameters({
      image: { type: 'string', description: 'Path to the source image (PNG/JPEG/WebP), absolute or relative to the session workspace.' },
    }),
    output: {
      schema: IMAGE_TOOL_OUTPUT,
      render: (_args, value) => renderImages(value),
      presentationMeta: (_args, value) => ({ paths: value.images.map(image => image.path) }),
    },
    isConcurrencySafe: () => false,
    presentCall(args) {
      const source = typeof args?.image === 'string' ? args.image : ''
      return {
        card: 'generic',
        title: `Edit image ${source}`,
        kind: 'edit',
        ...(source.length > 0 ? { locations: [{ path: source }] } : {}),
        rawInput: args,
      }
    },
    async execute(args, exec) {
      const rawImage = typeof args?.image === 'string' ? args.image.trim() : ''
      if (rawImage.length === 0) throw new Error('image must be a non-empty path to a source image')
      const settings = await currentSettings(config)
      const call = resolveCall(args, settings)
      const cwd = resolveWorkingDirectory(ctx, exec)
      const imagePath = isAbsolute(rawImage) ? rawImage : resolve(cwd, rawImage)
      const signal = withTimeout(exec.signal, settings.timeoutMs)
      const items = await requestEdit(settings, { ...call, imagePath }, signal)
      const images = await persistImages({ ctx, exec, items, prefixSource: `edit-${call.prompt}`, settings, signal })
      return { model: call.model, size: call.size, prompt: call.prompt, source: imagePath, images }
    },
  })

  ctx.tools.register({
    name: 'image_configure',
    description: 'Read or change the GPT image plugin configuration: API base URL, API key, model, default size, quality, background, and output directory. Use it when the user gives you a new image API address or key, or asks what the image settings currently are. The key is stored in a per-profile options file and is only ever returned masked.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        baseUrl: { type: 'string', description: 'API base URL, for example https://ai.stjapi.com. Changes apply immediately.' },
        apiKey: { type: 'string', description: 'The API key to save. Never echo it back to the user in full.' },
        model: { type: 'string', description: 'Default image model id, for example gpt-image-2.6-flare.' },
        size: { type: 'string', enum: [...SIZES], description: 'Default image size.' },
        quality: { type: 'string', enum: [...QUALITIES], description: 'Default render quality.' },
        background: { type: 'string', enum: [...BACKGROUNDS], description: 'Default background handling.' },
        outputDir: { type: 'string', description: 'Workspace-relative directory for generated files, for example gpt-images.' },
        clearApiKey: { type: 'boolean', description: 'Set true to delete the stored API key.' },
      },
    },
    output: {
      schema: STATE_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: `Image configuration: baseUrl ${value.baseUrl}, model ${value.model}, size ${value.size}, quality ${value.quality}, background ${value.background}, outputDir ${value.outputDir}, API key ${value.hasApiKey ? `saved (${value.apiKeyHint})` : 'not set'}.`,
      }],
    },
    isConcurrencySafe: () => true,
    presentCall(args) {
      const keys = args !== null && typeof args === 'object' ? Object.keys(args) : []
      return { kind: 'other', card: 'generic', title: keys.length === 0 ? 'Read image configuration' : `Update image configuration: ${keys.join(', ')}`, rawInput: args }
    },
    async execute(args) {
      return configure(config, args ?? {})
    },
  })

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined && typeof systemPrompt.section === 'function') {
    ctx.effect(() => systemPrompt.section({ name: 'gpt-image', order: 200, text: IMAGE_POLICY }))
  }

  const webServer = ctx.get('webServer')
  if (webServer !== undefined && typeof webServer.register === 'function') {
    const register = (path, handler) => ctx.effect(() => webServer.register({ kind: 'exact', path, handler }))
    register(ROUTES.config, (req, res) => handleConfigRoute(req, res, config))
    register(ROUTES.models, (req, res) => handleModelsRoute(req, res, config))
    register(ROUTES.test, (req, res) => handleTestRoute(req, res, config))
    register(ROUTES.gallery, (req, res) => handleGalleryRoute(req, res, ctx, config))
    register(ROUTES.file, (req, res) => handleFileRoute(req, res, ctx, config))
  }
}
