/* TODO
- different urls base for local files and modules
- require localized for a specific local file
- require localized for a module url (if module calls require ./)
- use local cache for local files
- use moduleCache for modules
- inspect package.json to see if there is cjs already pre-built
- add .js to local requires (but for modules)
  - local files start with ./ or ../  and others are considered modules
- typescript import must use .js (it is a bit strange, but probably has good reasons)
*/

// initially new Function was used to pass parameters: require, exports, module
// new Functions screws with sourcemaps as it adds a prefix to the source
// we need eval to do the same without prefix
// https://esbuild.github.io/content-types/#direct-eval
// to be nice to bundlers we need indirect eval
// also self is not available in nodejs
export const runModule = (typeof self === 'undefined' ? eval : self.eval)(
  '(require, exports, module, source)=>eval(source)',
)

const MODULE_BASE = 'https://cdn.jsdelivr.net/npm/'

export const selfish = (func, context) => {
  const out = func.bind({ context })
  out.bind = newContext => selfish(func, newContext)
  out.func = func
  out.context = context
  return out
}

/**
 * Resolve a package or file name to a url.
 * JS packages will resolve to an npm package url.
 * Relative urls will resolve to a local url.
 * @param {string} url the package or file name to resolve
 * @param {string} base the url of the current module to resolve relative to
 * @param {string} root the url under which local files are served
 * @param {string} moduleBase the url for npm packages
 * @returns the resolved module url
 */
export const resolveUrl = (url, base, root, moduleBase=MODULE_BASE)=>{
  let isRelativeFile = false
  let isModule = false
  let cacheUrl = url
  
  if (!/^(http:|https:|fs:|file:)/.test(url)) {
    // npm modules cannot start with . or /
    if (!/^\.?\.?\//.test(url)) {
      isModule = true
      url = new URL(url, moduleBase).toString()
    } else {
      isRelativeFile = true
      // sanitize to avoid going below root, it will prevent / to go below cache baseUrl
      // it will prevent ../../../../ to go below cache baseUrl
      const fromRoot = root && url[0] === '/'
      if (!fromRoot) {
        // base relative path
        const relativePath = base.replace(/^\//, '').replace(root, '') // strip root
        // create url relative path
        url = new URL(url, `fs:/root/${relativePath}`).toString()
        // check if url went above root
        if (!url.startsWith('fs:/root/')) throw new Error('relative url cannot go above root')
        url = url.substring(9)
      } else {
        url = url.substring(1)
      }
      cacheUrl = `/${url}`
      // now create the full url to load the file
      url = new URL(url, root).toString()
    }
  }
  
  return { url, isRelativeFile, isModule, cacheUrl }
}

export function require(urlOrSource, transform, _readFile, _base, root, readModule, moduleBase = MODULE_BASE) {
  let source
  let url
  let isRelativeFile
  let _url
  let cache
  let cacheUrl
  let bundleAlias
  if(typeof urlOrSource === 'string'){
    url = urlOrSource
  }else{
    source = urlOrSource.script
    url = urlOrSource.url
    isRelativeFile = true
  }
  let readFile = _readFile
  let base = _base
  let exports
  
  if (source === undefined) {
    bundleAlias = requireCache.bundleAlias[url]
    _url = requireCache.alias[url] || url
    cacheUrl = _url
    
    if(bundleAlias) _url = bundleAlias
  
    let resolved = resolveUrl(_url, base, root, moduleBase)
    const { isModule } = resolved
    url = resolved.url
    cacheUrl = resolved.cacheUrl
    isRelativeFile = resolved.isRelativeFile

    if(isModule) readFile = readModule
    base = url
    cache = requireCache[isRelativeFile ? 'local':'module']
    exports = cache[cacheUrl] // get from cache
    if (!exports) {
      // not cached
      try {
        source = readFile(url, { base })
      } catch (e) {
        if (url.endsWith('.js')) {
          try {
            url = url.substring(0, url.length - 2) + 'ts'
            source = readFile(url, { base })
          } catch (e2) {
            console.error('failed to load fallback .ts')
            throw e
          }
        }else{
          throw e
        }
      }
    }
  }
  if (source !== undefined) {
    // do not transform bundles that are already cjs ( requireCache.bundleAlias.*)
    if (transform && !bundleAlias) source = transform(source, url).code
    let requireFunc = newUrl => require(newUrl, transform, readFile, url, root, readModule, moduleBase)
    const module = requireModule(url, source, requireFunc)
    module.local = isRelativeFile
    exports = module.exports
  }

  if (typeof exports !== 'object') {
    throw new Error(`module ${cacheUrl} did not export an object`)
  }

  if(cache) cache[cacheUrl] = exports // cache obj exported by module
  // TODO research maybe in the future, why going through babel adds __esModule=true
  // this extra reference via defaults helps
  // exports.__esModule = false // this did not help
  exports.default = {...exports}

  return exports // require returns object exported by module
}

export function requireModule(url, source, _require) {
  try {
    const exports = {}
    const module = { id: url, uri: url, exports: exports, source } // according to node.js modules
    //module.require = _require
    runModule(_require, exports, module, source)
    return module
  } catch (err) {
    console.error('error loading module ' + url, err)
    throw err
  }
}

export const clearFileCache = async ({files}) => {
  const cache = requireCache.local
  files.forEach(f=>{
    console.warn('clear', f, cache[f])
    delete cache[f]
  })
}

export const clearTempCache = async ({}) => {
  requireCache.local = {}
  requireCache.alias = {}
}

export const requireCache = {
  local: {},
  alias: {},
  module: {},
  bundleAlias: {},
}
