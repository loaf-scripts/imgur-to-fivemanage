CREATE TABLE IF NOT EXISTS `fivemanage_convert_lookup` (
	`og_link` VARCHAR(1000) NOT NULL,
	`new_link` VARCHAR(500) DEFAULT NULL,
	`occurances` LONGTEXT DEFAULT NULL,

	PRIMARY KEY (`og_link`)
);
