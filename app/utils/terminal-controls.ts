export type LiveModifier = 'alt' | 'ctrl' | 'shift'

export type LiveControlKey
  = | 'arrowDown'
    | 'arrowLeft'
    | 'arrowRight'
    | 'arrowUp'
    | 'backspace'
    | 'c'
    | 'comma'
    | 'd'
    | 'enter'
    | 'escape'
    | 'pageDown'
    | 'pageUp'
    | 'period'
    | 'tab'

export type LiveModifiers = Record<LiveModifier, boolean>

const arrowCodes: Record<Extract<LiveControlKey, 'arrowDown' | 'arrowLeft' | 'arrowRight' | 'arrowUp'>, string> = {
  arrowDown: 'B',
  arrowLeft: 'D',
  arrowRight: 'C',
  arrowUp: 'A',
}

function hasModifier(modifiers: LiveModifiers): boolean {
  return modifiers.alt || modifiers.ctrl || modifiers.shift
}

function modifierParameter(modifiers: LiveModifiers): number {
  return 1
    + (modifiers.shift ? 1 : 0)
    + (modifiers.alt ? 2 : 0)
    + (modifiers.ctrl ? 4 : 0)
}

function withAltPrefix(data: string, modifiers: LiveModifiers): string {
  return modifiers.alt ? `\x1b${data}` : data
}

function printableSequence(character: string, modifiers: LiveModifiers): string {
  const shifted = modifiers.shift ? character.toUpperCase() : character

  if (modifiers.ctrl && /^[A-Z]$/i.test(character)) {
    return withAltPrefix(String.fromCharCode(character.toLowerCase().charCodeAt(0) - 96), modifiers)
  }

  return withAltPrefix(shifted, modifiers)
}

export function terminalSequenceForPrintableKey(character: string, modifiers: LiveModifiers): string {
  if (character.length !== 1) {
    return ''
  }

  return printableSequence(character, modifiers)
}

function punctuationSequence(key: 'comma' | 'period', modifiers: LiveModifiers): string {
  const character = key === 'comma'
    ? modifiers.shift ? '<' : ','
    : modifiers.shift ? '>' : '.'

  return withAltPrefix(character, modifiers)
}

export function terminalSequenceForLiveControl(key: LiveControlKey, modifiers: LiveModifiers): string {
  if (key in arrowCodes) {
    const code = arrowCodes[key as keyof typeof arrowCodes]

    return hasModifier(modifiers) ? `\x1b[1;${modifierParameter(modifiers)}${code}` : `\x1b[${code}`
  }

  if (key === 'pageUp') {
    return withAltPrefix(modifiers.ctrl ? '\x02\x1b[5~' : '\x1b[5~', modifiers)
  }

  if (key === 'pageDown') {
    return withAltPrefix('\x1b[6~', modifiers)
  }

  if (key === 'tab') {
    return withAltPrefix(modifiers.shift ? '\x1b[Z' : '\t', modifiers)
  }

  if (key === 'enter') {
    return withAltPrefix('\r', modifiers)
  }

  if (key === 'backspace') {
    return withAltPrefix(modifiers.ctrl ? '\x17' : '\x7f', modifiers)
  }

  if (key === 'escape') {
    return '\x1b'
  }

  if (key === 'comma' || key === 'period') {
    return punctuationSequence(key, modifiers)
  }

  return printableSequence(key, modifiers)
}
