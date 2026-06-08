import { makeVar } from '@apollo/client/core'

export type ResourcesPageFiltersState = {
  startDate: string
  endDate: string
  relations: Array<{ predicateUri: string; objectUri: string; subjectUri: string; isInverted: boolean }>
  isPublished: boolean
}

export type ResourcesPageState = {
  search: string
  showFilters: boolean
  viewMode: 'cards' | 'table'
  currentPage: number
  filters: ResourcesPageFiltersState
}

const defaultState: ResourcesPageState = {
  search: '',
  showFilters: false,
  viewMode: 'cards',
  currentPage: 1,
  filters: {
    startDate: '',
    endDate: '',
    relations: [
      { predicateUri: '', objectUri: '', subjectUri: '', isInverted: false }
    ],
    isPublished: false,
  },
}

export const resourcesPageStateVar = makeVar<ResourcesPageState>(defaultState)

export function resetResourcesPageState() {
  resourcesPageStateVar({
    ...defaultState,
    filters: {
      ...defaultState.filters,
      relations: defaultState.filters.relations.map((rel) => ({ ...rel })),
    },
  })
}
