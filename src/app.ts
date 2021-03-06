import {h, rec, variant, remap, list, block} from 'forest'

import {
  AstToken,
  ContentAstToken,
  ParentAstToken,
  extractText,
  parseToAST
} from './mdParser'

import {MANY_LINES, LARGE_ARTICLE} from './env'
import {VersionDate} from './index.h'

import {styles} from './styles'
import {Store, combine} from 'effector'
import {app} from './root'

type ReleaseNote = {
  version: string
  releaseID: string
  date: number
  library: 'effector' | 'react' | 'vue'
  content: AstToken[]
  manyLines: boolean
  largeArticle: boolean
}

type ReleaseGroup = {
  library: string
  groupID: string
  releases: ReleaseNote[]
}

export {app}
export const changelogMarkdown = app.createStore('')
const sections = changelogMarkdown.map(md => {
  const ast = parseToAST(md)
  const sections: AstToken[][] = []
  let releaseHeaderAppeared = false
  let currentSection: AstToken[] = []
  for (const token of ast) {
    if (token.type === 'heading') {
      if (token.level === 1) {
        currentSection = []
        continue
      }
      if (currentSection.length > 0) {
        if (releaseHeaderAppeared) sections.push(currentSection)
      }
      releaseHeaderAppeared = true
      currentSection = [token]
    } else {
      currentSection.push(token)
    }
  }
  if (currentSection.length > 0 && releaseHeaderAppeared)
    sections.push(currentSection)
  return sections
})

export const versionDates = app.createStore<VersionDate[]>([])

const releaseGroups = combine(sections, versionDates, createReleaseGroups)

function ChildToken<T extends ParentAstToken>(parent: Store<T>) {
  const childs = remap(parent, 'child')
  list({
    source: childs,
    key: 'id',
    fn({store}) {
      Token({store})
    }
  })
}
function ContentToken<T extends ContentAstToken>({store}: {store: Store<T>}) {
  h('span', {
    text: remap(store, 'value')
  })
}

const Token = rec<AstToken>(({store}) => {
  variant({
    source: store,
    key: 'type',
    cases: {
      strong({store}) {
        h('strong', () => {
          ChildToken(store)
        })
      },
      em({store}) {
        h('em', () => {
          ChildToken(store)
        })
      },
      del({store}) {
        h('del', () => {
          ChildToken(store)
        })
      },
      blockquote({store}) {
        h('blockquote', () => {
          ChildToken(store)
        })
      },
      br: () => h('br', {}),
      hr: () => h('hr', {}),
      codespan({store}) {
        h('code', {
          text: remap(store, 'value')
        })
      },
      paragraph({store}) {
        h('p', {
          data: {mdElement: 'paragraph'},
          fn() {
            ChildToken(store)
          }
        })
      },
      space: () => h('span', {text: ' '}),
      text: ContentToken,
      escape: ContentToken,
      tag: ContentToken,
      html: ContentToken,
      heading({store: value}) {
        const Heading = (level: number) => ({store}: {store: typeof value}) => {
          //@ts-ignore
          h(`h${level}`, {
            data: {headLink: level},
            fn() {
              const id = store.map(({child}) => {
                const id = formatId(extractText(child).join(''))
                return `#${id}`
              })

              h('a', {
                attr: {href: id},
                fn() {
                  ChildToken(store)
                }
              })
            }
          })
        }
        variant({
          source: value,
          key: 'level',
          cases: {
            1: Heading(1),
            2: Heading(2),
            3: Heading(3),
            4: Heading(4),
            5: Heading(5),
            6: Heading(6),
            __: Heading(6)
          }
        })
      },
      link({store}) {
        const [hrefRaw, title] = remap(store, ['href', 'title'] as const)
        title.watch(title => {
          if (title != null) console.error('title is not supported')
        })
        const href = hrefRaw.map(href => {
          if (href.endsWith('.md')) href = `#${href.replace('.md', '')}`
          else if (href.endsWith('.MD')) href = `#${href.replace('.MD', '')}`
          else if (/\.md\#/.test(href)) {
            href = href.replace(/\.md\#/, '#')
          } else if (/\.MD\#/.test(href)) {
            href = href.replace(/\.MD\#/, '#')
          }
          return href
        })
        h('a', {
          attr: {href},
          fn() {
            ChildToken(store)
          }
        })
      },
      code({store}) {
        h('pre', {
          data: {element: 'code'},
          fn() {
            h('code', {
              text: remap(store, 'value')
            })
          }
        })
      },
      list({store}) {
        variant({
          source: store,
          key: 'ordered',
          cases: {
            true({store}) {
              h('ol', {
                data: {mdElement: 'list'},
                fn() {
                  ChildToken(store)
                }
              })
            },
            __({store}) {
              h('ul', {
                data: {mdElement: 'list'},
                fn() {
                  ChildToken(store)
                }
              })
            }
          }
        })
      },
      listitem({store}) {
        store.watch(({task, checked}) => {
          if (task || checked !== undefined) {
            console.error('not supported')
          }
        })
        h('li', () => {
          ChildToken(store)
        })
      },
      checkbox({store}) {
        h('input', {
          attr: {
            type: 'checkbox',
            checked: remap(store, 'checked')
          }
        })
      },
      image({store}) {
        h('img', {
          attr: {
            src: remap(store, 'href')
          }
        })
      },
      __({store}) {
        h('span', {
          style: {
            color: 'firebrick',
            fontSize: '3em'
          },
          text: ['token ', remap(store, 'type')]
        })
      }
    }
  })
})

export const Body = block({
  fn() {
    h('div', {
      attr: {'aria-hidden': 'true'},
      text: '.',
      fn: styles.topFiller
    })
    h('section', {
      data: {appSection: 'docs'},
      fn() {
        styles.releaseList()
        h('header', () => {
          h('h1', {
            data: {headLink: 1},
            text: 'Changelog'
          })
        })
        h('nav', {
          fn() {
            styles.navigation()
            list({
              source: releaseGroups,
              key: 'groupID',
              fn({store, key: groupID}) {
                const href = groupID.map(groupID => `#${groupID}`)
                h('a', {
                  attr: {href},
                  text: remap(store, 'library')
                })
              }
            })
          }
        })
        list({
          source: releaseGroups,
          key: 'groupID',
          fn({store}) {
            ReleaseGroup(store)
          }
        })
      }
    })
    function ReleaseGroup(releaseGroup: Store<ReleaseGroup>) {
      const [library, groupID, releases] = remap(releaseGroup, [
        'library',
        'groupID',
        'releases'
      ] as const)
      HiddenLink(groupID, true)
      h('section', {
        fn() {
          styles.releaseGroup()
          h('header', () => {
            h('h2', {
              data: {headLink: 2},
              fn() {
                const href = groupID.map(groupID => `#${groupID}`)
                h('a', {
                  attr: {href},
                  text: library
                })
              }
            })
          })
          list({
            source: releases,
            key: 'releaseID',
            fn({store}) {
              const [
                version,
                content,
                manyLines,
                largeArticle,
                releaseID,
                date
              ] = remap(store, [
                'version',
                'content',
                'manyLines',
                'largeArticle',
                'releaseID',
                'date'
              ] as const)
              const formatter = new Intl.DateTimeFormat(['en-US'], {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
              const dateString = date.map(date => formatter.format(date))
              const dateISO = date.map(date => new Date(date).toISOString())
              const href = releaseID.map(releaseID => `#${releaseID}`)
              HiddenLink(releaseID)
              h('article', {
                data: {manyLines, largeArticle},
                fn() {
                  styles.release()
                  h('header', () => {
                    h('h3', {
                      data: {headLink: 3},
                      fn() {
                        h('a', {
                          attr: {href},
                          text: version
                        })
                      }
                    })
                    h('time', {
                      attr: {datetime: dateISO},
                      text: dateString
                    })
                  })
                  list({
                    source: content,
                    key: 'id',
                    fn({store}) {
                      Token({store})
                    }
                  })
                }
              })
            }
          })
        }
      })
    }
    function HiddenLink(linkID: Store<string>, groupLink: boolean = false) {
      h('a', {
        data: {anchor: groupLink ? 'group' : 'release'},
        attr: {
          id: linkID,
          'aria-hidden': 'true'
        },
        text: ' ',
        fn: styles.anchor
      })
    }
  }
})

function createReleaseGroups(
  sections: AstToken[][],
  versionDates: VersionDate[]
): ReleaseGroup[] {
  const releaseNotes = {
    effector: [] as ReleaseNote[],
    effectorReact: [] as ReleaseNote[],
    effectorVue: [] as ReleaseNote[]
  }
  for (const releaseNotesAst of sections) {
    const titleText = extractText([releaseNotesAst[0]]).join('')
    const effReactMentioned = /effector\-react/.test(titleText)
    const effVueMentioned = /effector\-vue/.test(titleText)
    const effectorMentioned = /effector(?!\-)/.test(titleText)
    const content = releaseNotesAst.slice(1)
    const textContent = extractText(content, {
      skipNodes: ['code'],
      keepLineBreaks: true
    }).join('')
    const manyLines = textContent.split(/\n/g).length > MANY_LINES
    const largeArticle = textContent.length > LARGE_ARTICLE
    if (effectorMentioned && !effVueMentioned && !effReactMentioned) {
      const version = titleText.replace('effector', '').trim()
      releaseNotes.effector.push({
        version,
        library: 'effector',
        content,
        manyLines,
        largeArticle,
        releaseID: formatId(`effector ${version}`),
        date: findReleaseDate('effector', version)
      })
    } else if (!effectorMentioned && !effVueMentioned && !effReactMentioned) {
      releaseNotes.effector.push({
        version: titleText,
        library: 'effector',
        content,
        manyLines,
        largeArticle,
        releaseID: formatId(`effector ${titleText}`),
        date: findReleaseDate('effector', titleText)
      })
    } else {
      if (effectorMentioned) {
        const versionMatcher = /(?:effector[^-]).*?(\d+\.\d+\.\d+(-\d+\.\d+\.\d+)?)/gm
        const [, version] = versionMatcher.exec(titleText)!
        releaseNotes.effector.push({
          version,
          library: 'effector',
          content,
          manyLines,
          largeArticle,
          releaseID: formatId(`effector ${version}`),
          date: findReleaseDate('effector', version)
        })
      }
      if (effReactMentioned) {
        const versionMatcher = /(?:effector-react).*?(\d+\.\d+\.\d+)/gm
        const [, version] = versionMatcher.exec(titleText)!
        releaseNotes.effectorReact.push({
          version,
          library: 'react',
          content,
          manyLines,
          largeArticle,
          releaseID: formatId(`effector-react ${version}`),
          date: findReleaseDate('effector-react', version)
        })
      }
      if (effVueMentioned) {
        const versionMatcher = /(?:effector-vue).*?(\d+\.\d+\.\d+)/gm
        const [, version] = versionMatcher.exec(titleText)!
        releaseNotes.effectorVue.push({
          version,
          library: 'vue',
          content,
          manyLines,
          largeArticle,
          releaseID: formatId(`effector-vue ${version}`),
          date: findReleaseDate('effector-vue', version)
        })
      }
    }
  }
  const {
    effector: effectorReleases,
    effectorReact: reactReleases,
    effectorVue: vueReleases
  } = releaseNotes

  return [
    {
      library: 'effector',
      groupID: formatId('effector'),
      releases: effectorReleases
    },
    {
      library: 'effector-react',
      groupID: formatId('effector-react'),
      releases: reactReleases
    },
    {
      library: 'effector-vue',
      groupID: formatId('effector-vue'),
      releases: vueReleases
    }
  ]

  function findReleaseDate(library: string, version: string) {
    const versions = version.match(/(\d+\.\d+\.\d+(-[a-z]+[a-z0-9.]*)?)/g)!
    for (const version of versions) {
      const versionDate = versionDates.find(
        e => e.library === library && e.version === version
      )
      if (!versionDate) {
        console.warn(`no version info found for ${library} ${version}`)
        continue
      }
      return versionDate.date
    }
    return -1
  }
}

function formatId(title: string) {
  return title
    .replace(/[(),?{}.:\[\]=;&$]+/g, '-')
    .replace(/ +/g, '-')
    .replace(/-+/g, '-')
    .replace(/-+$/, '')
    .toLowerCase()
}
