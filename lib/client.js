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
      sectionTitle: { fontSize: 13, fontWeight: 600, margin: 0 },
      gallery: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 },
      thumb: {
        width: '100%',
        height: 104,
        objectFit: 'cover',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        cursor: 'pointer',
        display: 'block',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      divider: { borderTop: '1px solid var(--dsw-alias-border-l1)', margin: '4px 0' },
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
      const [gallery, setGallery] = React.useState([])

      const loadGallery = React.useCallback(async () => {
        try {
          const response = await fetch(ENDPOINTS.gallery, { headers: { accept: 'application/json' } })
          const value = await response.json()
          setGallery(Array.isArray(value?.files) ? value.files : [])
        } catch {
          setGallery([])
        }
      }, [])

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
        loadGallery()
        return () => {
          active = false
        }
      }, [t, loadGallery])

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

      return h('div', { style: styles.page }, [
        h('p', { key: 'intro', style: styles.intro }, t.intro),
        h('div', { key: 'grid1', style: styles.grid }, [
          field('baseUrl', t.baseUrl, form.baseUrl, update('baseUrl'), { placeholder: 'https://ai.stjapi.com' }),
          field('apiKey', t.apiKey, form.apiKey, update('apiKey'), { type: 'password', placeholder: state?.hasApiKey ? state.apiKeyHint : 'sk-…' }),
        ]),
        h('span', { key: 'keyhint', style: styles.hint }, [t.keyHint, keyStatus.length > 0 ? ` ${keyStatus}` : ''].join(' ')),
        h('div', { key: 'grid2', style: styles.grid }, [
          field('model', t.model, form.model, update('model'), { placeholder: 'gpt-image-2.6-flare', list: 'gpt-image-models' }),
          h('datalist', { key: 'models', id: 'gpt-image-models' }, models.map(id => h('option', { key: id, value: id }))),
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
        h('div', { key: 'divider', style: styles.divider }),
        h('div', { key: 'gallery-head', style: styles.row }, [
          h('p', { key: 'title', style: styles.sectionTitle }, t.gallery),
          h('button', { key: 'refresh', type: 'button', style: styles.secondary, onClick: loadGallery }, t.refresh),
          h('span', { key: 'count', style: styles.status }, `${gallery.length}`),
        ]),
        gallery.length === 0
          ? h('span', { key: 'empty', style: styles.hint }, t.emptyGallery)
          : h('div', { key: 'thumbs', style: styles.gallery }, gallery.map(entry => h('img', {
            key: entry.name,
            src: `${ENDPOINTS.file}?name=${encodeURIComponent(entry.name)}`,
            alt: entry.name,
            title: `${entry.name}\n${Math.round((entry.bytes ?? 0) / 1024)} KB\n${t.open}`,
            style: styles.thumb,
            loading: 'lazy',
            onClick: () => {
              if (typeof window !== 'undefined') window.open(`${ENDPOINTS.file}?name=${encodeURIComponent(entry.name)}`, '_blank', 'noopener')
            },
          }))),
      ])
    }

    return {
      inject: ['slots'],
      apply(ctx) {
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
