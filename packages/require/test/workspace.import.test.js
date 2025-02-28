import { transformcjs } from '@jscadui/transform-babel'
import { expect, it } from 'vitest'

import { makeReadFileNode, readFileNode } from '../src/readFileNode.js'
import { require, requireCache } from '../src/require.js'

const root = 'test/workspace/import/'
const base = 'fs:/'

it('no_transform', () => {
  const readFileNode = makeReadFileNode(root)
  let pack = JSON.parse(readFileNode('/package.json'))
  // console.log('pack', pack)
  pack.workspaces?.forEach(w => {
    // todo move to utility
    let pack = JSON.parse(readFileNode(`/${w}/package.json`))
    let name = pack?.name || w
    let main = pack?.main || 'index.js'
    console.log('pack', pack)
    requireCache.alias[name] = new URL(`./${w}/${main}`, base).toString()
  })
  let script = require('/index.js', transformcjs, readFileNode, base)
  expect(script.main({ size: 11 })).toEqual('cube11')
})
