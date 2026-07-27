import MarkdownIt from 'markdown-it'
import {
  explorerImageUrl,
  resolveExplorerReference,
} from './explorer-reference'

interface MarkdownRenderEnvironment {
  documentPath: string
  sessionName: string
}

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
})

const defaultImageRule = markdown.renderer.rules.image
markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
  const token = tokens[index]!
  const source = token.attrGet('src')
  const env = environment as MarkdownRenderEnvironment
  const reference = source && resolveExplorerReference(env.documentPath, source)
  if (reference) {
    token.attrSet('src', explorerImageUrl(env.sessionName, reference.path))
  }
  token.attrSet('loading', 'lazy')
  token.attrSet('referrerpolicy', 'no-referrer')
  return defaultImageRule
    ? defaultImageRule(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options)
}

const defaultLinkOpenRule = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  const token = tokens[index]!
  const href = token.attrGet('href')
  const env = environment as MarkdownRenderEnvironment
  const reference = href && resolveExplorerReference(env.documentPath, href)

  if (reference) {
    token.attrSet('data-explorer-path', reference.path)
  }
  else if (href && /^(https?:)?\/\//i.test(href)) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
    token.attrSet('referrerpolicy', 'no-referrer')
  }

  return defaultLinkOpenRule
    ? defaultLinkOpenRule(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options)
}

export function renderExplorerMarkdown(
  source: string,
  environment: MarkdownRenderEnvironment,
): string {
  return markdown.render(source, environment)
}
