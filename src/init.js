/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { registerFileListHeaders } from '@nextcloud/files'
import { FilesCollectiveHeader } from './files/FilesCollectiveHeader.js'

registerFileListHeaders(FilesCollectiveHeader)
