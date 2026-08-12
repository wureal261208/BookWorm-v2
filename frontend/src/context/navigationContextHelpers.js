import { useContext } from 'react'

import { NavigationContext } from './navigationContextExports'

export function useNavigation() {
  return useContext(NavigationContext)
}


