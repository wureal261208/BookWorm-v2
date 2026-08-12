import { createContext } from 'react'

export const NavigationContext = createContext({
  activePage: 'home',
  isPageLoading: false,
  navigateTo: () => {},
})

