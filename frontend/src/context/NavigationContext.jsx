import { createContext, useContext } from 'react'

const NavigationContext = createContext({ activePage: 'home', isPageLoading: false, navigateTo: () => {} })

export function NavigationProvider({ value, children }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation() {
  return useContext(NavigationContext)
}
