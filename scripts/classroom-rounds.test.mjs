import test from 'node:test'
import assert from 'node:assert/strict'
import { formTeams } from '../src/utils/classroomRounds.js'
import { executeCoreDrawRequest } from '../src/core/web/coreService.js'

const people = Array.from({length:12}, (_,i)=>({ id:'p'+i, cn:i<2?'同名':'同学'+i, gender:'male' }))
test('temporary teams retain every identity once, have comparable sizes, and do not mutate roster order', () => {
  for (const count of [1,2,5,12,80]) {
    const input = people.slice(), teams = formTeams(input,count,()=>0.25)
    assert.equal(teams.length,Math.min(count,people.length))
    assert.equal(new Set(teams.flat().map(p=>p.id)).size,12)
    const lengths=teams.map(team=>team.length)
    assert.ok(Math.max(...lengths)-Math.min(...lengths)<=1)
    assert.deepEqual(input,people)
  }
  assert.deepEqual(formTeams([],3),[])
})

test('a relay handoff records one fresh identity per press, including two names spelled alike', () => {
  const roster=people.slice(0,2)
  const state={names:{lists:{a:{names:roster}}},statistics:{counts:{},totalCount:0},records:[]}
  const input={listId:'a',target:'people',count:1,allowDuplicates:false,gender:'all'}
  const caller={kind:'core-ui',pluginId:'core'}
  const seen=[], peopleCache=new Map()
  for(let i=0;i<2;i++){
    const tx=executeCoreDrawRequest({caller,input,state,peopleCache,singleDrawPreviousIds:seen})
    seen.push(tx.receipt.results[0].id)
    state.records=tx.nextRecords;state.statistics=tx.nextStatistics
    assert.equal(state.records.length,i+1)
    assert.equal(state.statistics.totalCount,i+1)
  }
  assert.equal(new Set(seen).size,2)
  assert.throws(()=>executeCoreDrawRequest({caller,input,state,peopleCache,singleDrawPreviousIds:seen}),{code:'CORE_TRANSACTION_REJECTED'})
  assert.equal(executeCoreDrawRequest({caller,input,state,peopleCache,singleDrawPreviousIds:[]}).receipt.results.length,1)
  assert.throws(()=>executeCoreDrawRequest({caller:{kind:'plugin',pluginId:'test'},input,state,singleDrawPreviousIds:seen}),{code:'CORE_TRANSACTION_REJECTED'})
})
