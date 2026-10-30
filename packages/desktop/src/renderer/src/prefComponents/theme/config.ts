export interface ThemeDescriptor {
  name: string
}

export const themes: ReadonlyArray<ThemeDescriptor> = [
  // Light Themes (alphabetical)
  { name: 'ayu-light' },
  { name: 'light' },
  { name: 'catppuccin-latte' },
  { name: 'everforest-light' },
  { name: 'github' },
  { name: 'graphite' },
  { name: 'gruvbox-light' },
  { name: 'rose-pine-dawn' },
  { name: 'solarized-light' },
  { name: 'tokyo-night-light' },
  { name: 'ulysses' },
  // Dark Themes (alphabetical)
  { name: 'ayu-dark' },
  { name: 'ayu-mirage' },
  { name: 'dark' },
  { name: 'catppuccin-mocha' },
  { name: 'cyberdream' },
  { name: 'dracula' },
  { name: 'everforest-dark' },
  { name: 'gruvbox-dark' },
  { name: 'horizon-dark' },
  { name: 'kanagawa' },
  { name: 'material-dark' },
  { name: 'monokai-pro' },
  { name: 'nightfox' },
  { name: 'nord' },
  { name: 'one-dark' },
  { name: 'oxocarbon-dark' },
  { name: 'palenight' },
  { name: 'rose-pine' },
  { name: 'rose-pine-moon' },
  { name: 'solarized-dark' },
  { name: 'synthwave-84' },
  { name: 'tokyo-night' },
  { name: 'tokyo-night-storm' }
]

// Names that title-casing the id would misspell.
const themeLabels: Readonly<Record<string, string>> = { github: 'GitHub' }

export const themeLabel = (name: string): string => themeLabels[name] ?? name.split('-')
  .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
