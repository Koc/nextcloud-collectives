<?php

namespace OCA\Collectives\Mount;

use OC\Files\Node\LazyFolder;
use OC\SystemConfig;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\InvalidPathException;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IDBConnection;

class CollectiveFolderManager {
	private const SKELETON_DIR = 'skeleton';
	private const LANDING_PAGE = 'Readme';
	private const LANDING_PAGE_SUFFIX = 'md';

	/** @var IRootFolder */
	private $rootFolder;

	/** @var IDBConnection */
	private $connection;

	/** @var SystemConfig */
	private $systemConfig;

	/** @var string */
	private $rootPath;

	/**
	 * CollectiveFolderManager constructor.
	 *
	 * @param IRootFolder   $rootFolder
	 * @param IDBConnection $connection
	 * @param SystemConfig  $systemConfig
	 */
	public function __construct(
		IRootFolder $rootFolder,
		IDBConnection $connection,
		SystemConfig $systemConfig) {
		$this->rootFolder = $rootFolder;
		$this->connection = $connection;
		$this->systemConfig = $systemConfig;
	}

	public function getRootPath(): string {
		if (null !== $this->rootPath) {
			return $this->rootPath;
		}

		$instanceId = $this->systemConfig->getValue('instanceid', null);
		if (null === $instanceId) {
			throw new \RuntimeException('no instance id!');
		}

		$this->rootPath = 'appdata_' . $instanceId . '/collectives';
		return $this->rootPath;
	}

	/**
	 * @return Folder
	 */
	public function getRootFolder(): Folder {
		$rootFolder = $this->rootFolder;
		return (new LazyFolder(function () use ($rootFolder) {
			try {
				return $rootFolder->get($this->getRootPath());
			} catch (NotFoundException $e) {
				return $rootFolder->newFolder($this->getRootPath());
			}
		}));
	}

	/**
	 * @return int
	 * @throws NotFoundException
	 */
	private function getRootFolderStorageId(): int {
		$qb = $this->connection->getQueryBuilder();

		$qb->select('fileid')
			->from('filecache')
			->where($qb->expr()->eq('storage', $qb->createNamedParameter($this->getRootFolder()->getStorage()->getCache()->getNumericStorageId())))
			->andWhere($qb->expr()->eq('path_hash', $qb->createNamedParameter(md5($this->getRootPath()))));

		return (int)$qb->execute()->fetchColumn();
	}

	/**
	 * @param Folder $folder
	 *
	 * @return Folder
	 * @throws NotPermittedException
	 */
	private function getSkeletonFolder(Folder $folder): Folder {
		try {
			$skeletonFolder = $folder->get(self::SKELETON_DIR);
			if (!$skeletonFolder instanceof Folder) {
				throw new NotFoundException('Not a folder: ' . $skeletonFolder->getPath());
			}
		} catch (NotFoundException $e) {
			$skeletonFolder = $folder->newFolder(self::SKELETON_DIR);
		}

		return $skeletonFolder;
	}

	/**
	 * @param string $lang
	 *
	 * @return string
	 */
	public function getLandingPagePath(string $path, string $lang): string {
		$landingPagePathEnglish = $path . '/' . self::LANDING_PAGE . '.en.' . self::LANDING_PAGE_SUFFIX;
		$landingPagePathLocalized = $path . '/' . self::LANDING_PAGE . '.' . $lang . '.' . self::LANDING_PAGE_SUFFIX;

		return file_exists($landingPagePathLocalized) ? $landingPagePathLocalized : $landingPagePathEnglish;
	}

	/**
	 * @param int $id
	 *
	 * @return array
	 *
	 * @throws NotFoundException
	 */
	public function getFolderFileCache(int $id): array {
		$qb = $this->connection->getQueryBuilder();
		$qb->select(
			'co.id AS folder_id', 'ci.name AS mount_point', 'fileid', 'storage', 'path', 'fc.name AS name',
			'mimetype', 'mimepart', 'size', 'mtime', 'storage_mtime', 'etag', 'encrypted', 'parent', 'permissions')
			->from('collectives', 'co')
			->leftJoin('co', 'circle_circles', 'ci', $qb->expr()->andX(
				$qb->expr()->eq('co.circle_unique_id', 'ci.unique_id')))
			->leftJoin('co', 'filecache', 'fc', $qb->expr()->andX(
				// concat with empty string to work around missing cast to string
				$qb->expr()->eq('fc.name', $qb->func()->concat('co.id', $qb->expr()->literal(''))),
				$qb->expr()->eq('parent', $qb->createNamedParameter($this->getRootFolderStorageId()))))
			->where($qb->expr()->eq('co.id', $qb->createNamedParameter($id)));
		return $qb->execute()->fetch();
	}

	/**
	 * @return array
	 */
	public function getAllFolders(): array {
		$qb = $this->connection->getQueryBuilder();
		$qb->select('co.id AS id', 'circle_unique_id', 'oc_circle_circles.name AS name')
			->from('collectives', 'co')
			->leftJoin('co', 'circle_circles', 'ci', $qb->expr()->andX(
				$qb->expr()->eq('co.circle_unique_id', 'ci.unique_id')
			));
		$rows = $qb->execute()->fetchAll();

		$folderMap = [];
		foreach ($rows as $row) {
			$id = (int)$row['id'];
			$folderMap[$id] = [
				'id' => $id,
				'mount_point' => $row['name'],
			];
		}

		return $folderMap;
	}

	/**
	 * @param int  $id
	 *
	 * @returns Folder
	 * @throws NotFoundException
	 * @throws InvalidPathException
	 */
	public function getFolder(int $id): Folder {
		$folder = $this->getRootFolder()->get((string)$id);
		if (!$folder instanceof Folder) {
			throw new InvalidPathException('Not a folder: ' . $folder->getPath());
		}
		return $folder;
	}

	/**
	 * @param int  $id
	 * @param string $lang
	 *
	 * @throws InvalidPathException
	 * @throws NotPermittedException
	 */
	public function createFolder(int $id, string $lang) {
		$landingPageFileName = self::LANDING_PAGE . '.' . self::LANDING_PAGE_SUFFIX;
		try {
			$folder = $this->getFolder($id);
		} catch (NotFoundException $e) {
			$folder = $this->getSkeletonFolder($this->getRootFolder())
				->copy($this->getRootFolder()->getPath() . '/' . $id);
		}
		if (!$folder->nodeExists($landingPageFileName)) {
			$landingPageDir = __DIR__ . '/../../' . self::SKELETON_DIR;
			$landingPagePath = $this->getLandingPagePath($landingPageDir, $lang);
			if (false !== $content = file_get_contents($landingPagePath)) {
				$folder->newFile($landingPageFileName, $content);
			}
		}
	}
}
