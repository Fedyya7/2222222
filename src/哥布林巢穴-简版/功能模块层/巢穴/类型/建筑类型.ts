{
type: uploaded file
fileName: kitakamic/goblingame/GoblinGame-97009b710d98a21075ed1d3a87f447b8244f8900/src/哥布林巢穴-简版/功能模块层/巢穴/类型/建筑类型.ts
fullContent:
/**
 * 建筑效果接口
 */
export interface BuildingEffect {
  type: string;
  icon: string;
  description: string;
}

/**
 * 建筑成本接口
 */
export interface BuildingCost {
  gold: number;
  food: number;
}

/**
 * 建筑收入接口
 */
export interface BuildingIncome {
  gold?: number;
  food?: number;
}

/**
 * 建筑解锁条件（简化版）
 */
export interface BuildingUnlockCondition {
  /** 需要建造的其他建筑ID列表（可选） */
  requiredBuildings?: string[];
  /** 自定义解锁状态（可选，由外部逻辑设置） */
  isUnlocked?: boolean;
}

/**
 * 建筑接口定义
 */
export interface Building {
  id: string;
  name: string;
  icon: string;
  description: string;
  cost: BuildingCost;
  // 新增 special 类型
  category: 'breeding' | 'resource' | 'global' | 'special';
  income?: BuildingIncome; // 每回合收入
  effects: BuildingEffect[];
  /** 解锁条件（仅全局建筑使用） */
  unlockCondition?: BuildingUnlockCondition;
  /** 最大建造数量（可选，不设置则无限制） */
  maxCount?: number;
}

/**
 * 建筑槽位接口定义
 */
export interface BuildingSlot {
  building: Building | null;
  unlocked: boolean;
  /** 分配到该槽位的人物的ID */
  assignedCharacterId?: string | null;
}

/**
 * 槽位类型
 */
// 新增 special 类型
export type SlotType = 'breeding' | 'resource' | 'global' | 'special';

/**
 * 槽位成本接口
 */
export interface SlotCost {
  gold: number;
  food: number;
}
}