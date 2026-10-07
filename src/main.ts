import '@fontsource/barlow/400.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/600.css'
import './styles.css'
import { ArrowRight, ChartColumn, CircleHelp, RotateCcw, Search, X, createIcons } from 'lucide'
import { loadGameData, puzzleFor } from './data'
import type { GameData, PuzzleLookup } from './data'
import { enterPlayer, giveUp, golfScore, localDate, newGame, undo } from './game'
import { computeStats, loadResults, outcome, shareText } from './stats'
import { loadProgress, RESULTS_KEY, saveProgress } from './storage'
import type { GameState, Player, Puzzle } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const jersey = (player: Player): string => player.number === null ? '#—' : `#${player.number}`
const years = (player: Player): string => player.firstSeason === player.lastSeason ? String(player.firstSeason) : `${player.firstSeason}–${player.lastSeason}`
const identity = (player: Player): string => [player.name, jersey(player), player.position, years(player)].filter(Boolean).join(' · ')
const formatDate = (date: string): string => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
const icons = () => createIcons({ icons: { ArrowRight, ChartColumn, CircleHelp, RotateCcw, Search, X } })

app.innerHTML = `
  <header class="masthead">
    <a class="wordmark" href="${import.meta.env.BASE_URL}" aria-label="Six Degrees home"><img src="${import.meta.env.BASE_URL}football.svg" alt="" width="32" height="32">SIX DEGREES<span class="edition">NFL</span></a>
    <div class="header-actions"><span class="daily-label">THE DAILY ROSTER CHAIN</span><button id="open-help" class="icon-button" aria-label="How to play" title="How to play"><i data-lucide="circle-help" aria-hidden="true"></i></button><button id="open-stats" class="icon-button" aria-label="Statistics" title="Statistics"><i data-lucide="chart-column" aria-hidden="true"></i></button></div>
  </header>
  <main>
    <section id="status-panel" class="status-panel" role="status"><p class="eyebrow">LOADING</p><h2>Pulling rosters…</h2><p>Every NFL roster week since 2002.</p></section>
    <div id="game" hidden>
      <div class="puzzle-heading"><div><p class="eyebrow" id="puzzle-date"></p><h1>Today's connection<span id="puzzle-number"></span></h1></div><div class="par"><span>PAR</span><strong id="par-number"></strong></div></div>
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
    </div>
    <footer><span>SHARED ROSTER WEEKS · 2002 ONWARD · <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener">DATA: NFLVERSE</a> (<a href="https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md" target="_blank" rel="noopener">CC BY 4.0</a>)</span><span>ONE PUZZLE. EVERY DAY.</span></footer>
  </main>
  <dialog id="give-up-dialog" aria-labelledby="give-up-title"><div class="dialog-heading"><h2 id="give-up-title">End today's puzzle?</h2><button id="close-dialog" class="icon-button" aria-label="Close" title="Close"><i data-lucide="x" aria-hidden="true"></i></button></div><p>Your result will be marked as given up and one shortest path will be revealed.</p><div class="dialog-actions"><button id="keep-playing" class="secondary-button">Keep playing</button><button id="confirm-give-up" class="danger-button">Give up</button></div></dialog>
  <dialog id="help-dialog" class="wide-dialog" aria-labelledby="help-title"><div class="dialog-heading"><h2 id="help-title">How to play</h2><button class="icon-button" data-close aria-label="Close" title="Close"><i data-lucide="x" aria-hidden="true"></i></button></div>
    <ol class="rules">
      <li>Build a chain of teammates from <strong>START</strong> to <strong>END</strong>.</li>
      <li>Each player you add must have been on the same team's roster as the previous player during at least one of the same weeks, regular season or playoffs, from 2002 on. They don't need to have played in a game together.</li>
      <li>Practice squad, injured reserve, and inactive players count. Offseason and training camp rosters don't.</li>
      <li>The puzzle solves itself as soon as your latest player shares a roster week with END.</li>
      <li><strong>Par</strong> is the fewest teammates needed. Score it like golf: fewer is better.</li>
      <li>Entering someone who isn't a teammate is a miss. Three misses ends the puzzle. Undo removes your last player for free but doesn't give back misses.</li>
    </ol>
    <p class="note"><strong>About the records:</strong> practice squad and reserve lists are complete from 2017. Earlier seasons mostly include active rosters, so some real teammates from 2002–2016 won't count.</p>
    <p>A new puzzle arrives at midnight your time. Roster data from nflverse (CC BY 4.0).</p>
    <div class="dialog-actions"><button class="primary-button" data-close autofocus>Play</button></div>
  </dialog>
  <dialog id="stats-dialog" class="wide-dialog" aria-labelledby="stats-title"><div class="dialog-heading"><h2 id="stats-title">Statistics</h2><button class="icon-button" data-close aria-label="Close" title="Close"><i data-lucide="x" aria-hidden="true"></i></button></div><div id="stats-body"></div></dialog>
`

const statusPanel = document.querySelector<HTMLElement>('#status-panel')!
const helpDialog = document.querySelector<HTMLDialogElement>('#help-dialog')!
const statsDialog = document.querySelector<HTMLDialogElement>('#stats-dialog')!
let storage: Storage | undefined
try { storage = localStorage } catch { storage = undefined }
const readStorage = (key: string): string | null => { try { return storage?.getItem(key) ?? null } catch { return null } }

function renderStats() {
  const today = localDate()
  const results = loadResults(readStorage(RESULTS_KEY))
  const stats = computeStats(results, today)
  const todays = results[today] ? outcome(results[today]) : undefined
  const tiles = [['Played', stats.played], ['Win %', stats.winRate], ['Current streak', stats.currentStreak], ['Best streak', stats.maxStreak]]
    .map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('')
  const most = Math.max(1, ...stats.distribution.map(band => band.count))
  const bars = stats.distribution.map(band => `<li class="${band.label === todays ? 'today' : ''}"><span class="band-label">${band.label}</span><span class="band-track">${band.count ? `<span class="band-bar" style="width: ${(band.count / most) * 100}%"></span>` : ''}</span><span class="band-count">${band.count}${band.label === todays ? '<span class="today-tag">TODAY</span>' : ''}</span></li>`).join('')
  document.querySelector('#stats-body')!.innerHTML = `<div class="stat-tiles">${tiles}</div>${stats.played
    ? `<h3 class="eyebrow">RESULTS</h3><ol class="distribution" aria-label="Results by outcome">${bars}</ol>`
    : '<p>Finish a puzzle to start your stats.</p>'}${storage ? '' : '<p>Stats cannot be saved in this browser.</p>'}`
}

function openStats() {
  renderStats()
  statsDialog.showModal()
}

document.querySelector('#open-help')!.addEventListener('click', () => helpDialog.showModal())
document.querySelector('#open-stats')!.addEventListener('click', openStats)
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog')!.close())

function showStatus(eyebrow: string, heading: string, detail: string, retry = false) {
  statusPanel.innerHTML = `<p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(detail)}</p>${retry ? '<button class="secondary-button" id="retry">Try again</button>' : ''}`
  statusPanel.hidden = false
  document.querySelector('#retry')?.addEventListener('click', () => location.reload())
}

loadGameData().then(start).catch((error: unknown) => {
  showStatus('SOMETHING WENT WRONG', "Couldn't load today's puzzle.", error instanceof Error ? error.message : String(error), true)
})

function start(data: GameData) {
  const { graph, playersById } = data
  const game = document.querySelector<HTMLElement>('#game')!
  const input = document.querySelector<HTMLInputElement>('#player-input')!
  const list = document.querySelector<HTMLUListElement>('#suggestions')!
  const feedback = document.querySelector<HTMLParagraphElement>('#feedback')!
  const dialog = document.querySelector<HTMLDialogElement>('#give-up-dialog')!
  const submit = document.querySelector<HTMLButtonElement>('.submit')!
  let currentDate = ''
  let puzzle: Puzzle | undefined
  let state: GameState = newGame()
  let activeIndex = -1
  let suggestions: Player[] = []

  function loadDay(date: string) {
    currentDate = date
    const lookup = puzzleFor(data, date)
    puzzle = lookup.kind === 'puzzle' ? lookup.puzzle : undefined
    state = puzzle && storage ? loadProgress(puzzle, data.version, graph, storage) : newGame()
    game.hidden = !puzzle
    if (lookup.kind !== 'puzzle') showUnavailable(lookup, date)
    else statusPanel.hidden = true
  }

  function showUnavailable(lookup: Exclude<PuzzleLookup, { kind: 'puzzle' }>, date: string) {
    if (lookup.kind === 'before') showStatus('COMING SOON', `Six Degrees starts ${formatDate(lookup.firstDate)}.`, 'Come back then for puzzle #1.')
    else if (lookup.kind === 'after') showStatus('NO PUZZLE TODAY', 'The puzzle calendar has run out.', `The last scheduled puzzle was ${formatDate(lookup.lastDate)}. New puzzles arrive with the next data update.`)
    else showStatus('NO PUZZLE TODAY', `No puzzle is scheduled for ${formatDate(date)}.`, 'Check back tomorrow.')
  }

  function connectionText(first: string, second: string): string {
    const connections = graph.connection(first, second) ?? []
    const shown = connections.slice(0, 3).map(connection => `Shared the ${connection.season} ${connection.team} roster (${connection.weeks} ${connection.weeks === 1 ? 'week' : 'weeks'})`)
    if (connections.length > 3) shown.push(`+${connections.length - 3} more ${connections.length === 4 ? 'season' : 'seasons'}`)
    return shown.join(' · ')
  }

  function playerRow(id: string, label: string, variant: string): string {
    const player = playersById.get(id)!
    const details = [jersey(player), player.position, years(player)].filter(Boolean).map(escapeHtml).join(' <span>·</span> ')
    return `<div class="player-row ${variant}"><span class="route-marker">${label === 'START' ? 'A' : label === 'END' ? 'B' : label}</span><div class="player-details"><span class="eyebrow">${label === 'START' || label === 'END' ? label : 'TEAMMATE'}</span><h2>${escapeHtml(player.name)}</h2><p>${details}</p></div>${variant === 'accepted' ? '<span class="accepted-label">LINKED</span>' : ''}</div>`
  }

  function render() {
    if (!puzzle) return
    document.querySelector('#puzzle-date')!.textContent = formatDate(puzzle.date).toUpperCase()
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
      const path = puzzle.optimalPath
      result.classList.toggle('won', won)
      result.innerHTML = `<p class="eyebrow">${won ? 'CONNECTION COMPLETE' : state.status === 'lost' ? 'THREE MISSES' : 'GIVEN UP'}</p><h2>${won ? golfScore(state.chain.length, puzzle.par) : state.status === 'lost' ? 'Missed.' : 'Until tomorrow.'}</h2><p>${won ? `Solved in ${state.chain.length} · Par ${puzzle.par}` : `Par ${puzzle.par} · One shortest path`}</p>${won ? '' : `<ol class="optimal-path">${path.map((id, index) => `<li><strong>${escapeHtml(playersById.get(id)!.name)}</strong><em>${years(playersById.get(id)!)}</em>${index > 0 ? `<span>${escapeHtml(connectionText(path[index - 1], id))}</span>` : ''}</li>`).join('')}</ol>`}<div class="result-actions"><button class="primary-button" id="share">Share result</button><button class="secondary-button" id="result-stats">Statistics</button></div><p id="share-status" role="status" aria-live="polite"></p><textarea id="share-fallback" aria-label="Result to copy" readonly rows="4" hidden></textarea>`
    }
    icons()
  }

  /** Switches to a new day's puzzle if the local date rolled over; returns true when it did. */
  function checkDate(): boolean {
    const date = localDate()
    if (date === currentDate) return false
    loadDay(date)
    input.value = ''
    closeSuggestions()
    render()
    feedback.textContent = puzzle ? 'A new daily puzzle is ready.' : ''
    return true
  }

  function persist() {
    if (!puzzle || !storage || !saveProgress(state, puzzle, data.version, storage)) {
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
    suggestions = data.search(input.value)
    renderSuggestions()
  }

  function selectPlayer(id: string) {
    if (checkDate() || !puzzle) return
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

  async function share() {
    if (!puzzle || state.status === 'playing') return
    const text = shareText(puzzle, state, `${location.origin}${import.meta.env.BASE_URL}`)
    const status = document.querySelector('#share-status')!
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ text })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      status.textContent = 'Result copied to clipboard. No player names included.'
    } catch {
      const fallback = document.querySelector<HTMLTextAreaElement>('#share-fallback')!
      fallback.value = text
      fallback.hidden = false
      fallback.select()
      status.textContent = 'Copying is blocked here. Copy your result from the box below.'
    }
  }

  document.querySelector('#result')!.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest('button')
    if (target?.id === 'share') void share()
    if (target?.id === 'result-stats') openStats()
  })
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
    if (checkDate() || state.status !== 'playing') return
    const matches = data.exactMatches(input.value)
    const selected = !list.hidden && activeIndex >= 0 ? suggestions[activeIndex] : matches.length === 1 ? matches[0] : suggestions.length === 1 && !list.hidden ? suggestions[0] : undefined
    if (selected) selectPlayer(selected.id)
    else feedback.textContent = matches.length > 1 ? 'More than one player has that name. Choose one from the suggestions.' : 'Select a player from the suggestions. No miss charged.'
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
  loadDay(localDate())
  render()
  if (!storage) feedback.textContent = 'Progress cannot be saved in this browser.'
  if (!readStorage('six-degrees:seen-help')) {
    helpDialog.showModal()
    try { storage?.setItem('six-degrees:seen-help', '1') } catch { /* shown again next visit */ }
  }
}
