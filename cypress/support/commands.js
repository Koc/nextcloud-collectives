import {
	NEW_COLLECTIVE,
	TRASH_COLLECTIVE,
	DELETE_COLLECTIVE,
	UPDATE_COLLECTIVE_EDIT_PERMISSIONS,
	UPDATE_COLLECTIVE_SHARE_PERMISSIONS,
	GET_PAGES,
	NEW_PAGE,
	GET_CIRCLES,
} from '../../src/store/actions'
import axios from '@nextcloud/axios'

const url = Cypress.config('baseUrl').replace(/\/index.php\/?$/g, '')
Cypress.env('baseUrl', url)

/**
 * Login a user to Nextcloud and visit a given route
 */
Cypress.Commands.add('login', (user, { password, route, onBeforeLoad } = {}) => {
	route = route || '/apps/collectives'
	password = password || user
	cy.session(user, function() {
		cy.visit(route)
		cy.get('input[name=user]').type(user)
		cy.get('input[name=password]').type(password)
		cy.get('form[name=login] input[type=submit]').click()
		cy.url().should('not.include', 'index.php/login?redirect_url')
		cy.url().should('include', route.replaceAll(' ', '%20'))
	})
	// in case the session already existed but we are on a different route...
	cy.visit(route, { onBeforeLoad })
})

/**
 * Logout a user from Nextcloud
 */
Cypress.Commands.add('logout', () => {
	cy.session('_guest', function() {
	})
})

/**
 * Enable/disable a Nextcloud app
 */
Cypress.Commands.add('toggleApp', (appName) => {
	cy.login('admin', { route: `/settings/apps/installed/${appName}` })
	cy.get('#app-sidebar-vue .app-details input.enable').click()
	cy.logout()
})

/**
 * First delete, then seed a collective (to start fresh)
 */
Cypress.Commands.add('deleteAndSeedCollective', (name) => {
	cy.deleteCollective(name)
	cy.seedCollective(name)
})

/**
 * Create a collective if it doesn't exist
 */
Cypress.Commands.add('seedCollective', (name) => {
	cy.window()
		.its('app')
		.then(async app => {
			await app.$store.dispatch(NEW_COLLECTIVE, { name })
				.catch(e => {
					if (e.request && e.request.status === 422) {
						// The collective already existed... carry on.
					} else {
						throw e
					}
				})
			const updatedCollectivePath = app.$store.getters.updatedCollectivePath
			if (updatedCollectivePath) {
				app.$router.push(updatedCollectivePath)
			} else {
				// Fallback - if collective exists, updatedCollectivePath is undefined
				app.$router.push(`/${name}`)
			}
		})
})

/**
 * Create a collective via UI
 */
Cypress.Commands.add('createCollective', (name) => {
	cy.get('a [title="Create new collective"]').click()
	cy.get('.collective-create input[type="text"]').type(`${name}{enter}`)
})

/**
 * Delete a collective if it exists
 */
Cypress.Commands.add('deleteCollective', (name) => {
	cy.window()
		.its('app')
		.then(async app => {
			const id = app.$store.state.collectives.collectives.find(c => c.name === name)?.id
			if (id) {
				await app.$store.dispatch(TRASH_COLLECTIVE, { id })
				await app.$store.dispatch(DELETE_COLLECTIVE, { id, circle: true })
			}
		})
})

/**
 * Change permission settings for a collective
 */
Cypress.Commands.add('seedCollectivePermissions', (name, type, level) => {
	cy.window()
		.its('app')
		.then(async app => {
			const id = app.$store.state.collectives.collectives.find(c => c.name === name).id
			if (type === 'edit') {
				await app.$store.dispatch(UPDATE_COLLECTIVE_EDIT_PERMISSIONS, { id, level })
			} else if (type === 'share') {
				await app.$store.dispatch(UPDATE_COLLECTIVE_SHARE_PERMISSIONS, { id, level })
			}
		})
})

/**
 * Add a page to a collective
 */
Cypress.Commands.add('seedPage', (name, parentFilePath, parentFileName) => {
	cy.window()
		.its('app')
		.then(async app => {
			await app.$store.dispatch(GET_PAGES)
			const parentId = app.$store.state.pages.pages.find(function(p) {
				return p.filePath === parentFilePath
					&& p.fileName === parentFileName
			}).id
			await app.$store.dispatch(NEW_PAGE, { title: name, pagePath: name, parentId })
		})
})

/**
 * Upload content of a page
 */
Cypress.Commands.add('seedPageContent', (user, pagePath, content) => {
	cy.window()
		.its('app')
		.then(async app => {
			await axios.put(`${Cypress.env('baseUrl')}/remote.php/dav/files/${user}/Collectives/${pagePath}`, content, {
				headers: {
					requesttoken: app.OC.requestToken,
					'Content-Type': 'text/markdown',
				},
			})
		})
})

/**
 * Create a circle (optionally with given config)
 */
Cypress.Commands.add('seedCircle', (name, config = null) => {
	cy.visit('/apps/collectives')
	cy.window()
		.its('app')
		.then(async app => {
			const api = `${Cypress.env('baseUrl')}/ocs/v2.php/apps/circles/circles`
			const response = await axios.post(api,
				{ name, personal: false, local: true },
				{ headers: { requesttoken: app.OC.requestToken } },
			)
			if (config) {
				const circleId = response.data.ocs.data.id
				// For now we only set the visibility
				const bits = [
					['visible', 8],
					['open', 16],
				]
				const value = bits
					.filter(([k, v]) => config[k])
					.reduce((sum, [k, v]) => sum + v, 0)
				await axios.put(`${api}/${circleId}/config`,
					{ value },
					{ headers: { requesttoken: app.OC.requestToken } },
				)
			}
		})
})

/**
 * Add someone to a circle
 */
Cypress.Commands.add('seedCircleMember', (name, userId) => {
	cy.window()
		.its('app')
		.then(async app => {
			await app.$store.dispatch(GET_CIRCLES)
			const circleId = app.$store.state.circles.circles.find(c => c.name === name).id
			const api = `${Cypress.env('baseUrl')}/ocs/v2.php/apps/circles/circles/${circleId}/members`
			await axios.post(api,
				{ userId, type: 1 },
				{ headers: { requesttoken: app.OC.requestToken } },
			).catch(e => {
				if (e.request && e.request.status === 400) {
					// The member already got added... carry on.
				} else {
					throw e
				}
			})
		})
})

/**
 * Add a group to the circle of a collective
 */
Cypress.Commands.add('addGroupToCollective', ({ group, collective }) => {
	cy.visit('/apps/contacts')
	cy.contains('.app-navigation-entry a', collective).click()
	cy.get('.app-content-list button.icon-add').click()
	cy.get('.entity-picker input').type(`${group}`)
	cy.get('.user-bubble__title').contains(group).click()
	cy.get('.entity-picker button.primary').click()
	cy.get(`.members-list [user="${group}"] button.action-item__menutoggle `).click()
	cy.contains('.popover .action button', 'Promote to Admin').click()
})
