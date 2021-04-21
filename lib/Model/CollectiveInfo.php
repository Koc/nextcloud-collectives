<?php

namespace OCA\Collectives\Model;

use OCA\Collectives\Db\Collective;

/**
 * Class CollectiveInfo
 * @method integer getAdmin()
 * @method void setAdmin(bool $value)
 * @method string getName()
 * @method void setName(string $value)
 */
class CollectiveInfo extends Collective {
	/** @var string */
	protected $name;

	/** @var bool */
	protected $admin;

	public function __construct(Collective $collective, string $name, bool $admin = false) {
		$this->id = $collective->getId();
		$this->circleUniqueId = $collective->getCircleUniqueId();
		$this->emoji = $collective->getEmoji();
		$this->trashTimestamp = $collective->getTrashTimestamp();
		$this->name = $name;
		$this->admin = $admin;
	}

	public function jsonSerialize() {
		return [
			'id' => $this->id,
			'circleUniqueId' => $this->circleUniqueId,
			'emoji' => $this->emoji,
			'trashTimestamp' => $this->trashTimestamp,
			'name' => $this->name,
			'admin' => $this->admin
		];
	}
}
