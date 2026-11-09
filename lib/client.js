window.__ModuleLoader__.load({
  id: 'dsh-plugin-gpt-image',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const ENDPOINTS = {
      config: '/gpt-image-api/config',
      models: '/gpt-image-api/models',
      test: '/gpt-image-api/test',
      gallery: '/gpt-image-api/gallery',
      file: '/gpt-image-api/file',
    }
    const SIZES = ['1024x1024', '1536x1024', '1024x1536', 'auto']
    const QUALITIES = ['auto', 'low', 'medium', 'high']
    const BACKGROUNDS = ['auto', 'transparent', 'opaque']
    const PANEL_ID = 'gpt-image-gallery'

    const TEXT = {
      zh: {
        label: 'GPT 生图',
        intro: '配置 GPT 生图接口。密钥只保存在本机 profile 的 gpt-image.options.json 中，不会写进插件包，也不会回传到界面。',
        baseUrl: 'API 地址',
        apiKey: 'API 密钥',
        model: '模型',
        size: '默认尺寸',
        quality: '画质',
        background: '背景',
        outputDir: '输出目录（相对工作区）',
        keySaved: '已保存',
        keyMissing: '未设置',
        keyHint: '留空表示保持现有密钥；填写新值会覆盖。',
        save: '保存',
        saving: '保存中…',
        clear: '清除密钥',
        saved: '已保存，立即生效。',
        cleared: '密钥已清除。',
        failed: '读取失败',
        fetchModels: '获取模型列表',
        fetching: '获取中…',
        test: '测试连接',
        testing: '测试中…',
        testOk: '连接正常',
        modelsLoaded: '已获取模型',
        gallery: '最近生成',
        refresh: '刷新',
        emptyGallery: '还没有生成过图片',
        open: '打开原图',
        saveAs: '另存为…',
        saved: '已保存',
        loading: '读取中…',
        count: '张',
        hintGallery: '这里列出当前工作区 gpt-images/ 里最近的图片，点开看原图。',
      },
      en: {
        label: 'GPT Image',
        intro: 'Configure the GPT image endpoint. The key is stored only in this profile\'s gpt-image.options.json — never in the bundle, never echoed back to the page.',
        baseUrl: 'API base URL',
        apiKey: 'API key',
        model: 'Model',
        size: 'Default size',
        quality: 'Quality',
        background: 'Background',
        outputDir: 'Output directory (workspace-relative)',
        keySaved: 'saved',
        keyMissing: 'not set',
        keyHint: 'Leave blank to keep the current key; a new value replaces it.',
        save: 'Save',
        saving: 'Saving…',
        clear: 'Clear key',
        saved: 'Saved. Applies immediately.',
        cleared: 'Key cleared.',
        failed: 'Could not load the configuration',
        fetchModels: 'Load models',
        fetching: 'Loading…',
        test: 'Test connection',
        testing: 'Testing…',
        testOk: 'Connected',
        modelsLoaded: 'models loaded',
        gallery: 'Recent images',
        refresh: 'Refresh',
        emptyGallery: 'No images generated yet',
        open: 'Open full size',
        saveAs: 'Save as…',
        loading: 'Loading…',
        count: 'images',
        hintGallery: 'The newest files in this workspace\'s gpt-images/ directory; click one to open the full size.',
      },
    }

    function language() {
      const raw = typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language.toLowerCase() : 'en'
      return raw.startsWith('zh') ? 'zh' : 'en'
    }

    const styles = {
      page: {
        maxWidth: 720,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        lineHeight: 1.5,
      },
      intro: { color: 'var(--dsw-alias-label-secondary)', margin: 0 },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 },
      field: { display: 'flex', flexDirection: 'column', gap: 6 },
      label: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        outline: 'none',
      },
      hint: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      primary: {
        padding: '7px 14px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
        color: '#ffffff',
        font: 'inherit',
        fontWeight: 600,
        cursor: 'pointer',
      },
      secondary: {
        padding: '7px 14px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        cursor: 'pointer',
      },
      ok: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12 },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 },
      status: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      panel: {
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'auto',
        padding: '18px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
      },
      panelHead: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'sticky',
        top: 0,
        paddingBottom: 6,
        background: 'var(--dsw-alias-bg-base)',
      },
      panelTitle: { fontSize: 15, fontWeight: 600, margin: 0, flex: '1 1 auto' },
      gallery: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10 },
      thumb: {
        width: '100%',
        aspectRatio: '1 / 1',
        objectFit: 'cover',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        cursor: 'pointer',
        display: 'block',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      caption: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 4, wordBreak: 'break-all' },
      lightbox: {
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        background: 'rgba(0, 0, 0, 0.82)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        cursor: 'zoom-out',
      },
      lightboxImage: {
        maxWidth: '92vw',
        maxHeight: '82vh',
        objectFit: 'contain',
        borderRadius: 8,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
        background: 'var(--dsw-alias-bg-base)',
      },
      lightboxBar: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: '92vw',
        color: '#ffffff',
        fontSize: 12,
      },
      lightboxName: { opacity: 0.75, wordBreak: 'break-all' },
      lightboxButton: {
        marginLeft: 8,
        padding: '4px 10px',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.5)',
        background: 'transparent',
        color: '#ffffff',
        font: 'inherit',
        cursor: 'pointer',
      },
    }

    function field(key, label, value, onChange, extra) {
      return h('label', { style: styles.field, key }, [
        h('span', { key: 'label', style: styles.label }, label),
        h('input', {
          key: 'input',
          style: styles.input,
          value,
          spellCheck: false,
          autoComplete: 'off',
          onChange: event => onChange(event.target.value),
          ...(extra ?? {}),
        }),
      ])
    }

    function select(key, label, value, options, onChange) {
      return h('label', { style: styles.field, key }, [
        h('span', { key: 'label', style: styles.label }, label),
        h('select', {
          key: 'select',
          style: styles.input,
          value,
          onChange: event => onChange(event.target.value),
        }, options.map(option => h('option', { key: option, value: option }, option))),
      ])
    }

    /** Sidebar icon for the gallery panel: a framed picture glyph. */
    function GalleryIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 18
      const stroke = props?.active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)'
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
      }, [
        h('rect', { key: 'frame', x: 3, y: 4.5, width: 18, height: 15, rx: 3, stroke, strokeWidth: 1.6 }),
        h('circle', { key: 'sun', cx: 8.5, cy: 10, r: 1.6, stroke, strokeWidth: 1.5 }),
        h('path', { key: 'hills', d: 'M4 17.5l4.6-4.2 3.6 3.2 3-2.6 4.8 4.1', stroke, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      ])
    }

    /** The gallery panel registered as a main-column view. */
    function GalleryPanel() {
      const t = React.useMemo(() => TEXT[language()], [])
      const [files, setFiles] = React.useState([])
      const [directory, setDirectory] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [preview, setPreview] = React.useState('')

      const load = React.useCallback(async () => {
        setBusy(true)
        setError('')
        try {
          const response = await fetch(ENDPOINTS.gallery, { headers: { accept: 'application/json' } })
          const value = await response.json()
          setFiles(Array.isArray(value?.files) ? value.files : [])
          setDirectory(typeof value?.directory === 'string' ? value.directory : '')
          if (typeof value?.error === 'string' && value.error.length > 0) setError(value.error)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      // A popup is blocked inside the desktop shell, so the full size renders in
      // a fixed overlay instead of a new window.
      React.useEffect(() => {
        if (preview.length === 0) return undefined
        const onKey = event => {
          if (event.key === 'Escape') setPreview('')
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [preview])

      // Chromium's save picker gives a real "save as" dialog; the anchor fallback
      // only downloads into the browser's default folder.
      const saveAs = async name => {
        setError('')
        const url = `${ENDPOINTS.file}?name=${encodeURIComponent(name)}&download=1`
        try {
          const response = await fetch(url)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const blob = await response.blob()
          if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
            const handle = await window.showSaveFilePicker({
              suggestedName: name,
              types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
            })
            const writable = await handle.createWritable()
            await writable.write(blob)
            await writable.close()
            return
          }
          const objectUrl = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = objectUrl
          anchor.download = name
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          URL.revokeObjectURL(objectUrl)
        } catch (failure) {
          if (failure?.name === 'AbortError') return
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      return h('div', { style: styles.panel }, [
        h('div', { key: 'head', style: styles.panelHead }, [
          h('h2', { key: 'title', style: styles.panelTitle }, t.gallery),
          h('span', { key: 'count', style: styles.status }, `${files.length} ${t.count}`),
          h('button', { key: 'refresh', type: 'button', style: styles.secondary, disabled: busy, onClick: load }, busy ? t.loading : t.refresh),
        ]),
        h('span', { key: 'hint', style: styles.hint }, directory.length > 0 ? `${t.hintGallery}  ${directory}` : t.hintGallery),
        error.length > 0 ? h('span', { key: 'err', style: styles.error }, error) : null,
        files.length === 0
          ? h('span', { key: 'empty', style: styles.hint }, busy ? t.loading : t.emptyGallery)
          : h('div', { key: 'grid', style: styles.gallery }, files.map(entry => h('div', { key: entry.name, style: { minWidth: 0 } }, [
            h('img', {
              key: 'img',
              src: `${ENDPOINTS.file}?name=${encodeURIComponent(entry.name)}`,
              alt: entry.name,
              title: `${entry.name}\n${Math.round((entry.bytes ?? 0) / 1024)} KB\n${t.open}`,
              style: styles.thumb,
              loading: 'lazy',
              onClick: () => setPreview(entry.name),
            }),
            h('div', { key: 'cap', style: styles.caption }, `${Math.round((entry.bytes ?? 0) / 1024)} KB`),
          ]))),
        preview.length === 0 ? null : h('div', {
          key: 'lightbox',
          style: styles.lightbox,
          onClick: () => setPreview(''),
        }, [
          h('img', {
            key: 'full',
            src: `${ENDPOINTS.file}?name=${encodeURIComponent(preview)}`,
            alt: preview,
            style: styles.lightboxImage,
          }),
          h('div', { key: 'bar', style: styles.lightboxBar }, [
            h('span', { key: 'name', style: styles.lightboxName }, preview),
            h('button', { key: 'save', type: 'button', style: styles.lightboxButton, onClick: () => saveAs(preview) }, t.saveAs),
            h('button', { key: 'close', type: 'button', style: styles.lightboxButton, onClick: () => setPreview('') }, '✕'),
          ]),
        ]),
      ])
    }

    function GptImageSettings() {
      const t = React.useMemo(() => TEXT[language()], [])
      const [form, setForm] = React.useState({
        baseUrl: '',
        apiKey: '',
        model: '',
        size: SIZES[0],
        quality: QUALITIES[0],
        background: BACKGROUNDS[0],
        outputDir: '',
      })
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [message, setMessage] = React.useState('')
      const [error, setError] = React.useState('')
      const [models, setModels] = React.useState([])

      React.useEffect(() => {
        let active = true
        fetch(ENDPOINTS.config, { headers: { accept: 'application/json' } })
          .then(response => response.json())
          .then(value => {
            if (!active) return
            setState(value)
            setForm(current => ({
              ...current,
              baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
              model: typeof value.model === 'string' ? value.model : '',
              size: typeof value.size === 'string' ? value.size : SIZES[0],
              quality: QUALITIES.includes(value.quality) ? value.quality : QUALITIES[0],
              background: BACKGROUNDS.includes(value.background) ? value.background : BACKGROUNDS[0],
              outputDir: typeof value.outputDir === 'string' ? value.outputDir : '',
            }))
          })
          .catch(() => {
            if (active) setError(t.failed)
          })
        return () => {
          active = false
        }
      }, [t])

      const update = key => value => setForm(current => ({ ...current, [key]: value }))

      const submit = async patch => {
        setBusy('save')
        setError('')
        setMessage('')
        try {
          const response = await fetch(ENDPOINTS.config, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(patch),
          })
          const value = await response.json()
          if (!response.ok) throw new Error(typeof value?.error === 'string' ? value.error : `HTTP ${response.status}`)
          setState(value)
          return value
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
          return undefined
        } finally {
          setBusy('')
        }
      }

      const save = async () => {
        const patch = {
          baseUrl: form.baseUrl,
          model: form.model,
          size: form.size,
          quality: form.quality,
          background: form.background,
          outputDir: form.outputDir,
        }
        if (form.apiKey.trim().length > 0) patch.apiKey = form.apiKey.trim()
        const value = await submit(patch)
        if (value !== undefined) {
          setForm(current => ({ ...current, apiKey: '' }))
          setMessage(t.saved)
        }
      }

      const clearKey = async () => {
        const value = await submit({ clearApiKey: true })
        if (value !== undefined) {
          setForm(current => ({ ...current, apiKey: '' }))
          setMessage(t.cleared)
        }
      }

      const testConnection = async () => {
        setBusy('test')
        setError('')
        setMessage('')
        try {
          const response = await fetch(ENDPOINTS.test, { method: 'POST', headers: { accept: 'application/json' } })
          const value = await response.json()
          if (!response.ok || value?.ok !== true) throw new Error(typeof value?.error === 'string' ? value.error : `HTTP ${response.status}`)
          setMessage(`${t.testOk} · ${value.latencyMs} ms · ${value.count} ${t.modelsLoaded}`)
          const listed = Array.isArray(value.models) ? value.models : []
          if (listed.length > 0) setModels(listed)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy('')
        }
      }

      const fetchModels = async () => {
        setBusy('models')
        setError('')
        setMessage('')
        try {
          const response = await fetch(ENDPOINTS.models, { headers: { accept: 'application/json' } })
          const value = await response.json()
          if (!response.ok) throw new Error(typeof value?.error === 'string' ? value.error : `HTTP ${response.status}`)
          const listed = Array.isArray(value.models) ? value.models : []
          setModels(listed)
          setMessage(`${listed.length} ${t.modelsLoaded}`)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy('')
        }
      }

      const keyStatus = state === null
        ? ''
        : `${t.apiKey}: ${state.hasApiKey ? `${t.keySaved} ${state.apiKeyHint ?? ''}` : t.keyMissing}`

      // A datalist filters by the current value, so it shows almost nothing once
      // the field holds a model id; a select lists every fetched model instead.
      const modelOptions = Array.from(new Set([form.model, ...models]
        .filter(value => typeof value === 'string' && value.trim().length > 0)))

      return h('div', { style: styles.page }, [
        h('p', { key: 'intro', style: styles.intro }, t.intro),
        h('div', { key: 'grid1', style: styles.grid }, [
          field('baseUrl', t.baseUrl, form.baseUrl, update('baseUrl'), { placeholder: 'https://ai.stjapi.com' }),
          field('apiKey', t.apiKey, form.apiKey, update('apiKey'), { type: 'password', placeholder: state?.hasApiKey ? state.apiKeyHint : 'sk-…' }),
        ]),
        h('span', { key: 'keyhint', style: styles.hint }, [t.keyHint, keyStatus.length > 0 ? ` ${keyStatus}` : ''].join(' ')),
        h('div', { key: 'grid2', style: styles.grid }, [
          modelOptions.length > 1
            ? select('model', t.model, form.model, modelOptions, update('model'))
            : field('model', t.model, form.model, update('model'), { placeholder: 'gpt-image-2.6-flare' }),
          field('outputDir', t.outputDir, form.outputDir, update('outputDir'), { placeholder: 'gpt-images' }),
        ]),
        h('div', { key: 'grid3', style: styles.grid }, [
          select('size', t.size, form.size, SIZES, update('size')),
          select('quality', t.quality, form.quality, QUALITIES, update('quality')),
          select('background', t.background, form.background, BACKGROUNDS, update('background')),
        ]),
        h('div', { key: 'actions', style: styles.row }, [
          h('button', { key: 'save', type: 'button', style: styles.primary, disabled: busy !== '', onClick: save }, busy === 'save' ? t.saving : t.save),
          h('button', { key: 'test', type: 'button', style: styles.secondary, disabled: busy !== '', onClick: testConnection }, busy === 'test' ? t.testing : t.test),
          h('button', { key: 'models', type: 'button', style: styles.secondary, disabled: busy !== '', onClick: fetchModels }, busy === 'models' ? t.fetching : t.fetchModels),
          h('button', { key: 'clear', type: 'button', style: styles.secondary, disabled: busy !== '', onClick: clearKey }, t.clear),
        ]),
        message.length > 0 ? h('span', { key: 'msg', style: styles.ok }, message) : null,
        error.length > 0 ? h('span', { key: 'err', style: styles.error }, error) : null,
        state !== null && typeof state.optionsFile === 'string'
          ? h('span', { key: 'file', style: styles.status }, state.optionsFile)
          : null,
        h('span', { key: 'hintgallery', style: styles.hint }, t.hintGallery),
      ])
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sidebar entry + its main-column panel share one id.
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => TEXT[language()].gallery }, GalleryIcon)
        ctx.slots.register({ name: 'main', key: PANEL_ID }, GalleryPanel)
        ctx.slots.register({
          name: 'settings.section',
          id: 'gpt-image',
          order: 25,
          label: () => TEXT[language()].label,
        }, GptImageSettings)
      },
    }
  },
})
