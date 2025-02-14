import { booleans, colors, primitives, transforms } from '@jscad/modeling'
import { JscadToCommon } from '@jscadui/format-jscad'
import { Gizmo } from '@jscadui/html-gizmo'
import { OrbitControl, OrbitState, closerAngle, getCommonRotCombined } from '@jscadui/orbit'
import { genParams } from '@jscadui/params'
import { initMessaging } from '@jscadui/postmessage'
import { makeAxes, makeGrid } from '@jscadui/scene'
import * as themes from '@jscadui/themes'

import {
  addPreLoad,
  addPreLoadAll,
  addToCache,
  clearFs,
  entryCheckPromise,
  extractEntries,
  filePromise,
  fileToFsEntry,
  findFileInRoots,
  getFile,
  readAsArrayBuffer,
  readAsText,
  readDir,
  registerServiceWorker,
} from '@jscadui/fs-provider'
import { availableEngines, availableEnginesList } from './src/availableEngines'
import { CurrentUrl } from './src/currentUrl'
import { EngineState } from './src/engineState'

const theme = themes.light
const { subtract } = booleans
const { translate } = transforms
const { colorize } = colors

export const byId = id => document.getElementById(id)
const toUrl = path => new URL(path, document.baseURI).toString()
const currentUrl = new CurrentUrl()
customElements.define('jscadui-gizmo', Gizmo)

const engineState = new EngineState(availableEngines, theme, makeAxes, makeGrid)
const useEngines = currentUrl.initGet('engines', 'three').split(',')

const gizmo = (window.gizmo = new Gizmo())
byId('layout').appendChild(gizmo)

const modelRadius = 30
let model = [
  subtract(
    primitives.sphere({ radius: modelRadius, segments: 16 }),
    translate([modelRadius, 0, modelRadius], primitives.sphere({ radius: modelRadius, segments: 16 })),
  ),
]

model.push(colorize([0.7, 0, 0], translate([60, 0, 0], primitives.sphere({ radius: 10 }))))
model.push(colorize([0, 0.7, 0], translate([0, 60, 0], primitives.sphere({ radius: 10 }))))
model.push(colorize([0, 0, 0.7], translate([0, 0, 60], primitives.sphere({ radius: 10 }))))
model.push(colorize([1, 0.7, 0, 0.5], translate([-20, -20, 0], primitives.cube({ size: 30 }))))

model = model.map(m => JscadToCommon(m))

function setTheme(theme) {
  viewers.forEach(viewer => {
    viewer.setBg(theme.bg)
    viewer.setMeshColor(theme.color)
  })
}

const stored = localStorage.getItem('camera.location')
let initialCamera = { position: [180, -180, 220] }
try {
  if (stored) initialCamera = JSON.parse(stored)
} catch (error) {
  console.log(error)
}

const elements = []
availableEnginesList.forEach(code => {
  const cfg = availableEngines[code]
  const el = byId('box_' + code)
  el.querySelector('i').textContent = cfg.name
  elements.push(el)
})

function setViewerScene(model) {
  engineState.setModel(model)
}
const ctrl = (window.ctrl = new OrbitControl(elements, { ...initialCamera, alwaysRotate: false }))
function setViewerCamera({ position, target, rx, rz }) {
  engineState.setCamera({ position, target })
  gizmo.rotateXZ(rx, rz)
}

const updateFromCtrl = change => {
  // console.log('change', change)
  const { position, target, rx, rz, len, ...rest } = change
  setViewerCamera(change)
}

updateFromCtrl(ctrl)

const saveCamera = cam => localStorage.setItem('camera.location', JSON.stringify(cam))

ctrl.onchange = state => saveCamera(state)
ctrl.oninput = state => updateFromCtrl(state)

gizmo.oncam = ({ cam }) => {
  const [rx, rz] = getCommonRotCombined(cam)
  ctrl.animateToCamera({ rx, rz, target: [0, 0, 0] })
}

const sel = byId('themeSelect')
for (let tn in themes) {
  const tmp = themes[tn]
  sel.add(new Option(tmp.name, tn))
}
sel.value = 'light'
sel.oninput = e => {
  const tmp = themes[sel.value]
  setTheme(tmp)
  setViewerScene(model)
}

const dropModal = byId('dropModal')
const showDrop = show => {
  clearTimeout(showDrop.timer)
  dropModal.style.display = show ? 'initial' : 'none'
}
document.body.ondrop = ev => {
  ev.preventDefault()
  showDrop(false)
  fileDropped(ev)
}

document.body.ondragover = ev => {
  ev.preventDefault()
  showDrop(true)
}
document.body.ondragleave = document.body.ondragend = ev => {
  clearTimeout(showDrop.timer)
  showDrop.timer = setTimeout(() => {
    showDrop(false)
  }, 300)
}

const handlers = {
  entities: ({ entities }) => {
    if (!(entities instanceof Array)) entities = [entities]
    setViewerScene((model = entities))
    setError(undefined)
  },
}

function setError(error) {
  const errorBar = byId('error-bar')
  if (error) {
    errorBar.style.display = "block"
    const errorMessage = byId('error-message')
    errorMessage.innerText = error
  } else {
    errorBar.style.display = "none"
  }
}

const link = document.createElement('a')
link.style.display = 'none'
document.body.appendChild(link)
function save(blob, filename) {
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
}

function exportModel(format) {
  sendCmd('exportData', { format }).then(({ data }) => {
    console.log('save', fileToRun + '.stl', data)
    save(new Blob([data], { type: 'text/plain' }), fileToRun + '.stl')
  }).catch((error) => setError(error))
}
window.exportModel = exportModel

const worker = new Worker('./build/bundle.worker.js')
const { sendCmd, sendNotify } = initMessaging(worker, handlers)

const spinner = byId('spinner')
async function sendCmdAndSpin(method, params){
  spinner.style.display = 'block'
  try{
    return await sendCmd(method, params)
  }catch(error){
    setError(error)
    throw error
  }finally{
    spinner.style.display = 'none'
  }
}

sendCmdAndSpin('init', {
  bundles: {
    '@jscad/modeling': toUrl('./build/bundle.jscad_modeling.js'),
  },
}).then(()=>{
  runScript({script:`const { sphere, geodesicSphere } = require('@jscad/modeling').primitives
  const { translate, scale } = require('@jscad/modeling').transforms
  
  const main = () => [
    translate([15, -25, 0], sphere({ radius: 10, segments: 12 })),
    translate([-15, -25, 0], geodesicSphere({ radius: 10, frequency: 6 })),
    
    translate([15, 0, 0], sphere({ radius: 10, segments: 32 })),
    translate([-15, 0, 0], geodesicSphere({ radius: 10, frequency: 24 })),
    
    scale([0.5, 1, 2], translate([15, 25, 0], sphere({ radius: 10, segments: 32 }))),
    scale([0.5, 2, 1], translate([30, 25, 0], sphere({ radius: 10, segments: 32 }))),
    scale([0.5, 1, 2], translate([-15, 25, 0], geodesicSphere({ radius: 10, frequency: 18 }))),
    scale([0.5, 2, 1], translate([-30, 25, 0], geodesicSphere({ radius: 10, frequency: 18 })))
  ]
  
  module.exports = { main }`
  })
})

const paramChangeCallback = params => {
  console.log('params changed', params)
  sendCmdAndSpin('runMain', { params })
}

const runScript = async ({script, url = './index.js', base, root}) => {
  const result = await sendCmdAndSpin('runScript', { script, url, base, root })
  genParams({ target: byId('paramsDiv'), params: result.def || {}, callback: paramChangeCallback })
}

let sw, swBase
registerServiceWorker('bundle.fs-serviceworker.js?prefix=/swfs/', async (path, sw) => {
  let arr = path.split('/').filter(p => p)
  let match = await findFileInRoots(sw.roots, arr)
  if (match) {
    fileIsRequested(path, match)
    return readAsArrayBuffer(await filePromise(match))
  }
}).then(async (_sw) => {
  sw = _sw
  swBase = new URL(`/swfs/${sw.id}/`, document.baseURI).toString()
}).catch((error) => setError(error))

const findByFsPath = (arr, file) => {
  const path = typeof file === 'string' ? file : file.fsPath
  return arr.find(f => f.fsPath === path)
}

const fileIsRequested = (path, file) => {
  let match
  if ((match = findByFsPath(checkPrimary, file))) return
  if ((match = findByFsPath(checkSecondary, file))) return
  checkSecondary.push(file)
}

let checkPrimary = (window.checkPrimary = [])
let checkSecondary = (window.checkSecondary = [])
let fileToRun
let lastCheck = Date.now()

const checkFiles = () => {
  const now = Date.now()
  // console.log('check', now - lastCheck > 1000, checkPrimary.length + checkSecondary.length)
  if (now - lastCheck > 300 && checkPrimary.length + checkSecondary.length != 0) {
    lastCheck = now
    let todo = checkPrimary.concat(checkSecondary).map(entryCheckPromise)
    Promise.all(todo).then(result => {
      // console.log('result', result)
      result = result.filter(([entry, file]) => entry.lastModified != entry._lastModified)
      if (result.length) {
        const todo = []
        const files = result.map(([entry, file]) => {
          todo.push(addToCache(sw.cache, entry.fsPath, file))
          return entry.fsPath
        })
        sendNotify('clearFileCache', { files })
        Promise.all(todo).then(result => {
          if (fileToRun) runScript({url:fileToRun, base:swBase})
        })
        console.log(
          'result',
          result.map(([entry, file]) => entry.fsPath + '/' + entry.lastModified),
        )
      }
    })

    // TODO clear sw cache
    // TODO sendCmd clearFileCache {files}
  }
  requestAnimationFrame(checkFiles)
}

checkFiles()

async function fileDropped(ev) {
  //this.worker.postMessage({action:'fileDropped', dataTransfer})
  let files = extractEntries(ev.dataTransfer)
  if (!files.length) return

  checkPrimary.length = 0
  checkSecondary.length = 0
  fileToRun = 'index.js'
  let folderName
  clearFs(sw)
  sendCmd('clearTempCache', {})
  let rootFiles = []
  if (files.length === 1) {
    const file = files[0]
    if (file.isDirectory) {
      folderName = file.name
      console.log('dropped', file.name)
      file.fsDir = '/'
      rootFiles = await readDir(file)
    } else {
      rootFiles.push(file)
      fileToRun = file.name
    }
  } else {
    rootFiles = Array.from(files)
  }
  rootFiles = rootFiles.map(e => fileToFsEntry(e, '/'))
  sw.roots.push(rootFiles)

  let pkgFile = await findFileInRoots(sw.roots, 'package.json')
  if (pkgFile) {
    try {
      const pack = JSON.parse(await readAsText(pkgFile))
      if (pack.main) fileToRun = pack.main
      const alias = []
      if (pack.workspaces)
        for (let i = 0; i < pack.workspaces.length; i++) {
          const w = pack.workspaces[i]
          // debugger
          let pack2 = await findFileInRoots(sw.roots, `/${w}/package.json`)
          if (pack2) pack2 = JSON.parse(await readAsText(pack2))
          let name = pack2?.name || w
          let main = pack2?.main || 'index.js'
          alias.push([`/${w}/${main}`, name])
        }
      if (alias.length) {
        sendNotify('init', { alias })
      }
    } catch (error) {
      console.error('error parsing package.json', error)
    }
  }

  let time = Date.now()
  const preLoad = ['/' + fileToRun, '/package.json']
  const loaded = await addPreLoadAll(sw, preLoad, true)
  console.log(Date.now() - time, 'preload', loaded)
  // TODO make proxy for calling commands
  // worker.cmd worker.notify

  if (fileToRun) {
    fileToRun = `/${fileToRun}`
    const file = await findFileInRoots(sw.roots, fileToRun)
    if (file) {
      runScript({url:fileToRun, base:swBase})
      checkPrimary.push(file)
    } else {
      setError(`main file not found ${fileToRun}`)
    }
  }
}

// ************ init ui     *********************************

window.boxInfoClick = function (event, box) {
  console.log('boxInfoClick', box, event.target)
}

Promise.all(useEngines.map(engine => engineState.initEngine(byId('box_' + engine), engine, ctrl))).then(() => {
  //
  console.log('engines initialized', useEngines)
})
