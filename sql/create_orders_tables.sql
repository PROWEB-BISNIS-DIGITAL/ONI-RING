-- SQL migration: create `orders` and `order_items` tables (safe for MySQL)
-- Run with: mysql -u root -p cemilan_ku < create_orders_tables.sql

-- Create orders table if it doesn't exist
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customer_name` VARCHAR(255) NULL,
  `customer_phone` VARCHAR(50) NULL,
  `customer_address` TEXT NULL,
  `payment_method` VARCHAR(50) NULL,
  `total` INT DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'pending',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create order_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `product_id` INT DEFAULT NULL,
  `product_name` VARCHAR(255) DEFAULT NULL,
  `price` INT DEFAULT 0,
  `quantity` INT DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX (`order_id`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- If your `order_items` table exists but is missing the `product_name` column,
-- run the following ALTER statement (uncomment to execute separately):
-- ALTER TABLE `order_items` ADD COLUMN `product_name` VARCHAR(255) DEFAULT NULL;
