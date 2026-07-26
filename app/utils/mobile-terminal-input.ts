export function suppressMobileTerminalKeyboard(host: HTMLElement | null): void {
  host
    ?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
    ?.setAttribute('inputmode', 'none')
}
