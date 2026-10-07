import '@fontsource/barlow/400.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/600.css'
import './styles.css'
import { ArrowRight, RotateCcw, Search, X, createIcons } from 'lucide'
import { dailyDemo, demo, graph } from './fixtures/demo'
import { enterPlayer, giveUp, golfScore, localDate, newGame, undo } from './game'
import { loadProgress, saveProgress } from './storage'
import type { Player } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!
const players = new Map(demo.players.map(player => [player.id, player]))
let puzzle = dailyDemo()
let storage: Storage | undefined
try { storage = localStorage } catch { storage = undefined }
let state = storage ? loadProgress(puzzle, demo.version, graph, storage) : newGame()
let activeIndex = -1
let suggestions: Player[] = []

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const identity = (player: Player): string => `${player.name} · #${player.number} · ${player.firstSeason}–${player.lastSeason}`
const icons = () => createIcons({ icons: { ArrowRight, RotateCcw, Search, X } })

app.innerHTML = `
  <header class="masthead">
    <a class="wordmark" href="${import.meta.env.BASE_URL}" aria-label="Six Degrees home"><img src="${import.meta.env.BASE_URL}football.svg" alt="" width="32" height="32">SIX DEGREES<span class="edition">NFL</span></a>
    <span class="daily-label">THE DAILY ROSTER CHAIN</span>
  </header>
  <main>
    <div class="puzzle-heading"><div><p class="eyebrow" id="puzzle-date"></p><h1>Today's connection<span id="puzzle-number"></span></h1></div><div class="par"><span>PAR</span><strong id="par-number"></strong></div></div>
    <div class="demo-notice"><span class="demo-dot"></span>Prototype · synthetic connections, not verified NFL data</div>
    <section aria-label="Player chain" class="route" id="route"></section>
    <section class="entry" aria-label="Enter a player">
      <div class="entry-heading"><label for="player-input">Next teammate</label><span id="misses"></span></div>
      <form id="player-form" autocomplete="off">
        <div class="search-field"><i data-lucide="search" aria-hidden="true"></i><input id="player-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions" placeholder="Search NFL players" spellcheck="false"><button class="submit icon-button" aria-label="Add player" title="Add player" type="submit"><i data-lucide="arrow-right" aria-hidden="true"></i></button></div>
        <ul id="suggestions" role="listbox" aria-label="Player suggestions" hidden></ul>
      </form>
      <p id="feedback" role="status" aria-live="polite"></p>
      <div class="actions"><button id="undo" class="icon-button" title="Undo last link" aria-label="Undo last link"><i data-lucide="rotate-ccw" aria-hidden="true"></i></button><span id="link-count"></span><button id="give-up" class="text-button">Give up</button></div>
    </section>
    <section id="result" class="result" aria-label="Puzzle result" hidden></section>
    <footer><span>ROSTER CONNECTIONS · 2002 ONWARD</span><span>ONE PUZZLE. EVERY DAY.</span></footer>
  </main>
  <dialog id="give-up-dialog" aria-labelledby="give-up-title"><div class="dialog-heading"><h2 id="give-up-title">End today's puzzle?</h2><button id="close-dialog" class="icon-button" aria-label="Close" title="Close"><i data-lucide="x" aria-hidden="true"></i></button></div><p>Your result will be marked as given up and one shortest path will be revealed.</p><div class="dialog-actions"><button id="keep-playing" class="secondary-button">Keep playing</button><button id="confirm-give-up" class="danger-button">Give up</button></div></dialog>
`

const input = document.querySelector<HTMLInputElement>('#player-input')!
const list = document.querySelector<HTMLUListElement>('#suggestions')!
const feedback = document.querySelector<HTMLParagraphElement>('#feedback')!
const dialog = document.querySelector<HTMLDialogElement>('#give-up-dialog')!
const submit = document.querySelector<HTMLButtonElement>('.submit')!

function connectionText(first: string, second: string): string {
  return (graph.connection(first, second) ?? []).map(connection => `Shared the ${connection.season} ${connection.team} roster (${connection.weeks} ${connection.weeks === 1 ? 'week' : 'weeks'})`).join(' · ')
}

function playerRow(id: string, label: string, variant: string): string {
  const player = players.get(id)!
  return `<div class="player-row ${variant}"><span class="route-marker">${label === 'START' ? 'A' : label === 'END' ? 'B' : label}</span><div class="player-details"><span class="eyebrow">${label === 'START' || label === 'END' ? label : 'TEAMMATE'}</span><h2>${escapeHtml(player.name)}</h2><p>#${player.number} <span>·</span> ${player.position} <span>·</span> ${player.firstSeason}–${player.lastSeason}</p></div>${variant === 'accepted' ? '<span class="accepted-label">LINKED</span>' : ''}</div>`
}

function render() {
  document.querySelector('#puzzle-date')!.textContent = new Date(`${puzzle.date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
  document.querySelector('#puzzle-number')!.textContent = `#${puzzle.number}`
  document.querySelector('#par-number')!.textContent = String(puzzle.par)
  let route = playerRow(puzzle.start, 'START', 'start')
  let previous = puzzle.start
  for (const [index, id] of state.chain.entries()) {
    route += `<p class="connection">${escapeHtml(connectionText(previous, id))}</p>${playerRow(id, String(index + 1).padStart(2, '0'), 'accepted')}`
    previous = id
  }
  if (state.status === 'playing') {
    const slots = Math.max(puzzle.par, state.chain.length + 1)
    for (let index = state.chain.length; index < slots; index++) {
      route += `<div class="empty-row ${index === state.chain.length ? 'next-slot' : ''}"><span class="route-marker">${String(index + 1).padStart(2, '0')}</span><span>${index === state.chain.length ? 'Next connection' : 'Open connection'}</span>${index === puzzle.par - 1 ? '<span class="par-slot">PAR</span>' : ''}</div>`
    }
  }
  if (state.status === 'won') route += `<p class="connection">${escapeHtml(connectionText(previous, puzzle.end))}</p>`
  route += playerRow(puzzle.end, 'END', 'end')
  document.querySelector('#route')!.innerHTML = route
  document.querySelector('#misses')!.innerHTML = `<span class="miss-label">MISSES</span> ${Array.from({ length: 3 }, (_, index) => `<span class="miss-dot ${index < state.misses ? 'used' : ''}" aria-hidden="true">${index < state.misses ? '×' : '·'}</span>`).join('')}<span class="sr-only">${state.misses} of 3</span>`
  document.querySelector<HTMLButtonElement>('#undo')!.disabled = state.status !== 'playing' || !state.chain.length
  document.querySelector<HTMLButtonElement>('#give-up')!.disabled = state.status !== 'playing'
  document.querySelector('#link-count')!.textContent = `${state.chain.length} ${state.chain.length === 1 ? 'link' : 'links'}`
  input.disabled = state.status !== 'playing'
  submit.disabled = input.disabled
  const result = document.querySelector<HTMLElement>('#result')!
  result.hidden = state.status === 'playing'
  if (!result.hidden) {
    const won = state.status === 'won'
    result.classList.toggle('won', won)
    result.innerHTML = `<p class="eyebrow">${won ? 'CONNECTION COMPLETE' : state.status === 'lost' ? 'THREE MISSES' : 'GIVEN UP'}</p><h2>${won ? golfScore(state.chain.length, puzzle.par) : state.status === 'lost' ? 'Missed.' : 'Until tomorrow.'}</h2><p>${won ? `Solved in ${state.chain.length} · Par ${puzzle.par}` : `Par ${puzzle.par} · One optimal path`}</p>${won ? '' : `<ol class="optimal-path">${puzzle.optimalPath.map((id, index) => `<li><strong>${escapeHtml(players.get(id)!.name)}</strong>${index > 0 ? `<span>${escapeHtml(connectionText(puzzle.optimalPath[index - 1], id))}</span>` : ''}</li>`).join('')}</ol>`}`
  }
  icons()
}

function checkDate(): boolean {
  const date = localDate()
  if (date === puzzle.date) return false
  puzzle = dailyDemo(date)
  state = storage ? loadProgress(puzzle, demo.version, graph, storage) : newGame()
  input.value = ''
  closeSuggestions()
  render()
  feedback.textContent = 'A new daily puzzle is ready.'
  return true
}

function persist() {
  if (!storage || !saveProgress(state, puzzle, demo.version, storage)) {
    feedback.textContent += ' Progress cannot be saved in this browser.'
  }
}

function closeSuggestions() {
  list.hidden = true
  activeIndex = -1
  input.setAttribute('aria-expanded', 'false')
  input.removeAttribute('aria-activedescendant')
}

function renderSuggestions() {
  list.hidden = !suggestions.length
  input.setAttribute('aria-expanded', String(!list.hidden))
  list.innerHTML = suggestions.map((player, index) => `<li role="option" id="suggestion-${index}" aria-selected="${index === activeIndex}" data-player-id="${player.id}">${escapeHtml(identity(player))}</li>`).join('')
  if (activeIndex >= 0) {
    input.setAttribute('aria-activedescendant', `suggestion-${activeIndex}`)
    list.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  } else input.removeAttribute('aria-activedescendant')
}

function updateSuggestions() {
  activeIndex = -1
  const query = input.value.trim().toLocaleLowerCase()
  suggestions = query ? demo.players.filter(player => player.name.toLocaleLowerCase().includes(query)).sort((first, second) => first.name.localeCompare(second.name)).slice(0, 8) : []
  renderSuggestions()
}

function selectPlayer(id: string) {
  if (checkDate()) return
  const outcome = enterPlayer(state, id, puzzle, graph)
  state = outcome.state
  feedback.textContent = outcome.message
  feedback.classList.toggle('error', outcome.message.includes('miss'))
  input.value = ''
  closeSuggestions()
  persist()
  render()
  if (state.status === 'playing') input.focus()
}

input.addEventListener('input', updateSuggestions)
input.addEventListener('focus', updateSuggestions)
input.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSuggestions()
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
    event.preventDefault()
    activeIndex = activeIndex === -1
      ? event.key === 'ArrowDown' ? 0 : suggestions.length - 1
      : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length
    renderSuggestions()
  }
})
list.addEventListener('mousedown', event => event.preventDefault())
list.addEventListener('click', event => {
  const option = (event.target as HTMLElement).closest<HTMLElement>('[data-player-id]')
  if (option) selectPlayer(option.dataset.playerId!)
})
document.addEventListener('click', event => {
  if (!document.querySelector('#player-form')!.contains(event.target as Node)) closeSuggestions()
})
document.querySelector('#player-form')!.addEventListener('submit', event => {
  event.preventDefault()
  if (state.status !== 'playing' || checkDate()) return
  const matches = demo.players.filter(player => player.name.toLocaleLowerCase() === input.value.trim().toLocaleLowerCase())
  const selected = !list.hidden && activeIndex >= 0 ? suggestions[activeIndex] : matches.length === 1 ? matches[0] : suggestions.length === 1 && !list.hidden ? suggestions[0] : undefined
  if (selected) selectPlayer(selected.id)
  else feedback.textContent = matches.length > 1 ? 'Choose a specific player from the suggestions.' : 'Select a player from the suggestions. No miss charged.'
})
document.querySelector('#undo')!.addEventListener('click', () => {
  if (checkDate()) return
  state = undo(state)
  feedback.textContent = 'Last link removed. No miss charged.'
  feedback.classList.remove('error')
  persist()
  render()
  input.focus()
})
document.querySelector('#give-up')!.addEventListener('click', () => { if (!checkDate()) dialog.showModal() })
for (const selector of ['#close-dialog', '#keep-playing']) document.querySelector(selector)!.addEventListener('click', () => dialog.close())
document.querySelector('#confirm-give-up')!.addEventListener('click', () => {
  dialog.close()
  if (checkDate()) return
  state = giveUp(state)
  feedback.textContent = 'Puzzle ended. One shortest path is revealed below.'
  closeSuggestions()
  persist()
  render()
})
window.addEventListener('focus', checkDate)
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDate() })
render()
if (!storage) feedback.textContent = 'Progress cannot be saved in this browser.'
