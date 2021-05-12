import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

import {
	SET_PAGES,
	ADD_PAGE,
	UPDATE_PAGE,
	DELETE_PAGE_BY_ID,
} from './mutations'

import {
	GET_PAGES,
	GET_PAGE,
	NEW_PAGE,
	TOUCH_PAGE,
	RENAME_PAGE,
	DELETE_PAGE,
} from './actions'

export default {
	state: {
		pages: [],
		updatedPage: {},
	},

	getters: {
		pagePath(_state, getters) {
			return getters.pageParam || 'Readme'
		},

		currentPage(state, getters) {
			// Return landing page
			if (getters.pagePath === 'Readme') {
				return getters.collectivePage
			}

			// Iterate through all path levels to find the correct page
			const parts = getters.pagePath.split('/').filter(Boolean)
			let page = getters.collectivePage
			for (const i in parts) {
				page = state.pages.find(p => (p.parentId === page.id && p.title === parts[i]))
			}
			return page
		},

		mostRecentSubpages: (state, getters) => (parentId) => {
			return getters.visibleSubpages(parentId).sort((a, b) => b.timestamp - a.timestamp)
		},

		collectivePage(state) {
			return state.pages.find(p => (p.parentId === 0 && p.title === 'Readme'))
		},

		visibleSubpages: (state) => (parentId) => {
			return state.pages.filter(p => p.parentId === parentId)
		},

		updatedPagePath(state, getters) {
			const collective = getters.collectiveParam
			const { filePath, title, id } = state.updatedPage
			const pagePath = [collective, filePath, title].filter(Boolean).join('/')
			return `/${pagePath}?fileId=${id}`
		},

		pagesUrl(_state, getters) {
			return generateUrl(`/apps/collectives/_collectives/${getters.currentCollective.id}/_pages`)
		},

		pageCreateUrl(_state, getters) {
			return parentId => `${getters.pagesUrl}/parent/${parentId}`
		},

		pageUrl(_state, getters) {
			return (parentId, pageId) => `${getters.pagesUrl}/parent/${parentId}/page/${pageId}`
		},

		touchUrl(_state, getters) {
			return `${getters.pageUrl(getters.currentPage.parentId, getters.currentPage.id)}/touch`
		},

	},

	mutations: {
		[SET_PAGES](state, pages) {
			state.pages = pages
		},

		[UPDATE_PAGE](state, page) {
			state.pages.splice(
				state.pages.findIndex(p => p.id === page.id),
				1,
				page
			)
			state.updatedPage = page
		},

		[ADD_PAGE](state, page) {
			state.pages.unshift(page)
			state.updatedPage = page
		},

		[DELETE_PAGE_BY_ID](state, id) {
			state.pages.splice(state.pages.findIndex(p => p.id === id), 1)
		},

	},

	actions: {

		/**
		 * Get list of all pages
		 */
		async [GET_PAGES]({ commit, getters }) {
			commit('load', 'collective', { root: true })
			const response = await axios.get(getters.pagesUrl)
			commit(SET_PAGES, response.data.data)
			commit('done', 'collective', { root: true })
		},

		/**
		 * Get a single page and update it in the store
		 * @param {number} parentId Parent ID
		 * @param {number} pageId Page ID
		 */
		async [GET_PAGE]({ commit, getters, state }, { parentId, pageId }) {
			commit('load', 'page', { root: true })
			const response = await axios.get(getters.pageUrl(parentId, pageId))
			commit(UPDATE_PAGE, response.data.data)
			commit('done', 'page', { root: true })
		},

		/**
		 * Create a new page
		 * @param {Object} page Properties for the new page (title for now)
		 */
		async [NEW_PAGE]({ commit, getters }, page) {
			commit('load', 'page', { root: true })
			const response = await axios.post(getters.pageCreateUrl(page.parentId), page)
			// Add new page to the beginning of pages array
			commit(ADD_PAGE, { newTitle: '', ...response.data.data })
			commit('done', 'page', { root: true })
		},

		async [TOUCH_PAGE]({ commit, getters }) {
			const response = await axios.get(getters.touchUrl)
			commit(UPDATE_PAGE, response.data.data)
		},

		/**
		 * Rename the current page
		 * @param {string} newTitle new title for the page
		 */
		async [RENAME_PAGE]({ commit, getters, state }, newTitle) {
			commit('load', 'page', { root: true })
			const page = getters.currentPage
			page.title = newTitle
			delete page.newTitle
			const response = await axios.put(getters.pageUrl(page.parentId, page.id), page)
			commit(UPDATE_PAGE, response.data.data)
			commit('done', 'page', { root: true })
		},

		/**
		 * Delete the current page
		 */
		async [DELETE_PAGE]({ commit, getters, state }) {
			commit('load', 'page', { root: true })
			await axios.delete(getters.pageUrl(getters.currentPage.parentId, getters.currentPage.id))
			commit(DELETE_PAGE_BY_ID, getters.currentPage.id)
			commit('done', 'page', { root: true })
		},
	},
}