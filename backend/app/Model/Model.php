<?php

declare(strict_types=1);

namespace App\Model;

use Hyperf\DbConnection\Model\Model as BaseModel;

/**
 * 项目模型基类：统一默认连接与日期序列化格式。
 */
abstract class Model extends BaseModel
{
    /** 表里 created_at/updated_at 均为 DATETIME，统一按此格式读写。 */
    protected ?string $dateFormat = 'Y-m-d H:i:s';
}
