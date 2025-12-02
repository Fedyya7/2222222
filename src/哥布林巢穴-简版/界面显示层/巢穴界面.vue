<template>
  <div class="nest-container">
    <NestHeader :total-income="totalIncome" />

    <BuildingTabs :active-tab="activeTab" @tab-change="activeTab = $event" />

    <div class="building-content">
      <BuildingSlotGrid
        v-if="activeTab === 'breeding'"
        :slots="breedingSlots"
        :slot-type="'breeding'"
        :get-slot-cost="getSlotCost"
        :is-next-unlock-slot="(index: number) => isNextUnlockSlot(index, 'breeding')"
        :get-occupant="(index: number) => getBreedingRoomOccupant(index)"
        @slot-click="(index: number) => handleSlotClick(index, 'breeding')"
        @remove-building="(index: number) => removeBuilding(index, 'breeding')"
        @sacrifice-click="() => {}"
      />

      <BuildingSlotGrid
        v-if="activeTab === 'resource'"
        :slots="resourceSlots"
        :slot-type="'resource'"
        :get-slot-cost="getSlotCost"
        :is-next-unlock-slot="(index: number) => isNextUnlockSlot(index, 'resource')"
        @slot-click="(index: number) => handleSlotClick(index, 'resource')"
        @remove-building="(index: number) => removeBuilding(index, 'resource')"
        @sacrifice-click="openSacrificeDialog"
      />

      <BuildingSlotGrid
        v-if="activeTab === 'special'"
        :slots="specialSlots"
        :slot-type="'special'"
        :get-slot-cost="getSlotCost"
        :is-next-unlock-slot="(index: number) => isNextUnlockSlot(index, 'special')"
        :get-occupant="(index: number) => getSpecialRoomOccupant(index)"
        @slot-click="(index: number) => handleSlotClick(index, 'special')"
        @remove-building="(index: number) => removeBuilding(index, 'special')"
      />

      <GlobalBuildingsGrid
        v-if="activeTab === 'global'"
        :available-buildings="globalBuildings"
        :built-buildings="builtGlobalBuildings"
        :is-unlocked="checkGlobalBuildingUnlock"
        :can-build="canBuildGlobalBuilding"
        @build="handleBuildGlobalBuilding"
        @remove="handleRemoveGlobalBuilding"
        @interact="handleGlobalBuildingInteract"
      />
    </div>

    <BuildingMenu
      :show="showMenu"
      :available-buildings="availableBuildings"
      :can-build="canBuild as any"
      @close="closeMenu"
      @select-building="selectBuilding as any"
    />

    <div v-if="showSpecialManager" class="modal-overlay" @click="closeSpecialManager">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ selectedSpecialBuilding?.name }} - 管理</h3>
          <button class="close-btn" @click="closeSpecialManager">×</button>
        </div>
        <div class="modal-body special-manager-body">
          <div class="building-info">
            <div class="icon">{{ selectedSpecialBuilding?.icon }}</div>
            <p>{{ selectedSpecialBuilding?.description }}</p>
          </div>
          
          <div class="worker-section">
            <h4>当前工作人员</h4>
            <div v-if="selectedSpecialWorker" class="worker-card">
              <div class="worker-avatar">
                <img v-if="selectedSpecialWorker.avatar" :src="selectedSpecialWorker.avatar" />
                <span v-else>👤</span>
              </div>
              <div class="worker-info">
                <div class="name">{{ selectedSpecialWorker.name }}</div>
                <div class="status">状态: {{ getStatusText(selectedSpecialWorker.status) }}</div>
              </div>
              <button class="remove-btn" @click="removeWorker">解雇</button>
            </div>
            <div v-else class="empty-worker" @click="openCharacterSelector">
              <span>➕ 分配俘虏</span>
            </div>
          </div>

          <div class="actions-section">
            <button 
              class="action-btn interact" 
              :disabled="!selectedSpecialWorker"
              @click="enterBuildingInteraction"
            >
              🚪 进入建筑互动
            </button>
            <button class="action-btn danger" @click="demolishSpecialBuilding">
              💣 拆除建筑
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showCharacterSelector" class="modal-overlay" @click="closeCharacterSelector">
      <div class="modal-content selector-content" @click.stop>
        <div class="modal-header">
          <h3>选择工作人员</h3>
          <button class="close-btn" @click="closeCharacterSelector">×</button>
        </div>
        <div class="character-list">
          <div 
            v-for="char in availableCharacters" 
            :key="char.id" 
            class="char-item"
            @click="selectWorker(char)"
          >
            <img v-if="char.avatar" :src="char.avatar" class="char-avatar"/>
            <span v-else class="char-icon">👤</span>
            <div class="char-details">
              <div class="name">{{ char.name }}</div>
              <div class="stats">体力: {{ char.stamina }} | 堕落: {{ char.loyalty }}%</div>
            </div>
          </div>
          <div v-if="availableCharacters.length === 0" class="no-chars">
            没有可用的俘虏（需处于关押或已堕落状态且未分配）
          </div>
        </div>
      </div>
    </div>

    <OptionTrainingInterface
      v-if="showInteraction && selectedSpecialWorker"
      :character="selectedSpecialWorker"
      @close="closeInteraction"
      @update-character="handleInteractionUpdate"
    />

    <SacrificeDialog :show="showSacrificeDialog" @close="closeSacrificeDialog" @confirm="handleSacrificeConfirm" />

    <AudienceHallInterface :show="showAudienceHall" @close="showAudienceHall = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { SacrificeService, type SacrificeAmounts } from '../功能模块层/巢穴/服务/献祭服务';
import { modularSaveManager } from '../核心层/服务/存档系统/模块化存档服务';
import type { NestModuleData } from '../核心层/服务/存档系统/模块化存档类型';
import { PlayerLevelService } from '../核心层/服务/通用服务/玩家等级服务';
import { ConfirmService } from '../核心层/服务/通用服务/确认框服务';
// 建筑类型和数据
import { breedingBuildings, globalBuildings, resourceBuildings, specialBuildings } from '../功能模块层/巢穴/数据/建筑数据';
import type { Building, BuildingSlot, SlotCost, SlotType } from '../功能模块层/巢穴/类型/建筑类型';
// 巢穴界面子页面
import GlobalBuildingsGrid from './巢穴界面子页面/全局建筑网格.vue';
import AudienceHallInterface from './巢穴界面子页面/全局建筑页面/谒见厅界面.vue';
import NestHeader from './巢穴界面子页面/巢穴头部.vue';
import BuildingTabs from './巢穴界面子页面/建筑标签页.vue';
import BuildingSlotGrid from './巢穴界面子页面/建筑槽位网格.vue';
import BuildingMenu from './巢穴界面子页面/建筑选择菜单.vue';
import SacrificeDialog from './巢穴界面子页面/献祭对话框.vue';
// [新增] 引入互动界面组件
import OptionTrainingInterface from './调教界面子页面/选项式调教界面.vue';

// ==================== 资源管理 ====================

// 直接使用 modularSaveManager 获取错误提示功能
const getInsufficientResourcesMessage = modularSaveManager.getInsufficientResourcesMessage.bind(modularSaveManager);

// ==================== 建筑和槽位资源管理 ====================

const canAffordBuilding = (cost: { gold: number; food: number }): boolean => {
  return modularSaveManager.hasEnoughResources([
    { type: 'gold', amount: cost.gold, reason: '建筑成本' },
    { type: 'food', amount: cost.food, reason: '建筑成本' },
  ]);
};

const payForBuilding = (cost: { gold: number; food: number }, buildingName: string): boolean => {
  return modularSaveManager.consumeResources([
    { type: 'gold', amount: cost.gold, reason: `建设${buildingName}` },
    { type: 'food', amount: cost.food, reason: `建设${buildingName}` },
  ]);
};

const canAffordSlotExpansion = (cost: { gold: number; food: number }): boolean => {
  return modularSaveManager.hasEnoughResources([
    { type: 'gold', amount: cost.gold, reason: '槽位开通' },
    { type: 'food', amount: cost.food, reason: '槽位开通' },
  ]);
};

const payForSlotExpansion = (cost: { gold: number; food: number }): boolean => {
  return modularSaveManager.consumeResources([
    { type: 'gold', amount: cost.gold, reason: '开通槽位' },
    { type: 'food', amount: cost.food, reason: '开通槽位' },
  ]);
};

// ==================== 响应式数据 ====================

const activeTab = ref<SlotType>('breeding');
const showMenu = ref(false);
const selectedSlotIndex = ref(-1);
const selectedSlotType = ref<SlotType>('breeding');

const breedingSlots = ref<BuildingSlot[]>([]);
const resourceSlots = ref<BuildingSlot[]>([]);
const specialSlots = ref<BuildingSlot[]>([]); // [新增] 特殊建筑槽位
const builtGlobalBuildings = ref<Record<string, number>>({});

const characters = ref<any[]>([]);

// ==================== [新增] 特殊建筑管理状态 ====================
const showSpecialManager = ref(false);
const showCharacterSelector = ref(false);
const showInteraction = ref(false);
const selectedSpecialWorker = ref<any>(null);

// ==================== 献祭相关数据 ====================

const showSacrificeDialog = ref(false);
const currentSacrificeSlotIndex = ref(-1);
const showAudienceHall = ref(false);

// ==================== 计算属性 ====================

const availableBuildings = computed(() => {
  let buildings: Building[];
  if (activeTab.value === 'breeding') {
    buildings = breedingBuildings;
  } else if (activeTab.value === 'resource') {
    buildings = resourceBuildings;
  } else if (activeTab.value === 'special') { // [新增] 特殊建筑处理
    buildings = specialBuildings;
  } else {
    buildings = globalBuildings;
  }

  // 为繁殖间计算动态成本
  if (activeTab.value === 'breeding') {
    return buildings.map(building => {
      if (building.id === 'breeding') {
        const existingBreedingCount = breedingSlots.value.filter(slot => slot.building?.id === 'breeding').length;
        return {
          ...building,
          cost: {
            gold: building.cost.gold + existingBreedingCount * 25,
            food: building.cost.food + existingBreedingCount * 15,
          },
        };
      }
      return building;
    });
  }

  // 资源建筑：过滤掉已存在的献祭祭坛
  if (activeTab.value === 'resource') {
    return buildings.filter(building => {
      if (building.id === 'sacrifice_altar') {
        const existingAltarCount = resourceSlots.value.filter(slot => slot.building?.id === 'sacrifice_altar').length;
        return existingAltarCount === 0;
      }
      return true;
    });
  }

  return buildings;
});

const totalIncome = computed(() => {
  let totalGold = 0;
  let totalFood = 0;

  // 遍历所有类型槽位计算收入，包括新的 specialSlots
  [breedingSlots.value, resourceSlots.value, specialSlots.value].forEach(slots => {
    slots.forEach(slot => {
      if (slot.building && slot.building.income) {
        if (slot.building.income.gold) totalGold += slot.building.income.gold;
        if (slot.building.income.food) totalFood += slot.building.income.food;
      }
    });
  });

  // 全局建筑收入
  globalBuildings.forEach(building => {
    const count = builtGlobalBuildings.value[building.id] || 0;
    if (count > 0 && building.income) {
      if (building.income.gold) totalGold += building.income.gold * count;
      if (building.income.food) totalFood += building.income.food * count;
    }
  });

  // 应用加成
  const foodWarehouseCount = resourceSlots.value.filter(s => s.building?.id === 'food_warehouse').length;
  const goldHallCount = resourceSlots.value.filter(s => s.building?.id === 'gold_hall').length;

  if (foodWarehouseCount > 0) totalFood = Math.round(totalFood * Math.pow(1.1, foodWarehouseCount));
  if (goldHallCount > 0) totalGold = Math.round(totalGold * Math.pow(1.1, goldHallCount));

  return { gold: totalGold, food: totalFood };
});

// [新增] 计算当前选中特殊建筑的详细信息
const selectedSpecialBuilding = computed(() => {
  if (selectedSlotIndex.value === -1 || selectedSlotType.value !== 'special') return null;
  return specialSlots.value[selectedSlotIndex.value]?.building;
});

// [新增] 计算可用人员列表
const availableCharacters = computed(() => {
  return characters.value.filter(c => 
    (c.status === 'imprisoned' || c.status === 'surrendered') && 
    !c.locationId // 只显示未分配地点的角色
  );
});

// ==================== 槽位管理 ====================

const initializeSlots = () => {
  console.log('开始初始化槽位...');

  // 初始化繁殖间槽位
  breedingSlots.value = [
    { building: breedingBuildings.find(b => b.id === 'breeding') || null, unlocked: true },
    { building: null, unlocked: true }
  ];

  // 初始化资源建筑槽位
  resourceSlots.value = [
    { building: resourceBuildings.find(b => b.id === 'food') || null, unlocked: true },
    { building: resourceBuildings.find(b => b.id === 'trade') || null, unlocked: true },
    { building: null, unlocked: false }
  ];

  // [新增] 初始化特殊建筑槽位
  specialSlots.value = [
    { building: null, unlocked: true },
    { building: null, unlocked: false }
  ];

  builtGlobalBuildings.value = {};
};

const addNewSlot = (type: SlotType) => {
  const newSlot = { building: null, unlocked: false };
  if (type === 'breeding') breedingSlots.value.push(newSlot);
  else if (type === 'resource') resourceSlots.value.push(newSlot);
  else if (type === 'special') specialSlots.value.push(newSlot); // [新增]
};

const getSlotCost = (index: number): SlotCost => {
  const baseGold = 200;
  const baseFood = 100;
  const multiplier = Math.max(0, index - 1); // 前2个槽位免费
  return {
    gold: baseGold + multiplier * 50,
    food: baseFood + multiplier * 20,
  };
};

// ==================== 槽位状态管理 ====================

const handleSlotClick = (index: number, type: SlotType) => {
  if (type === 'global') return;
  
  // [修改] 支持 special 类型
  let slots = type === 'breeding' ? breedingSlots.value : 
              type === 'resource' ? resourceSlots.value : specialSlots.value;
  const slot = slots[index];

  if (!slot.unlocked) {
    if (canUnlockSlot(index, type)) {
      const cost = getSlotCost(index);
      if (canAffordSlotExpansion(cost)) {
        if (payForSlotExpansion(cost)) {
          slot.unlocked = true;
          addNewSlot(type);
          saveBuildingData();
        }
      } else {
        const message = getInsufficientResourcesMessage([
          { type: 'gold', amount: cost.gold, reason: '槽位开通' },
          { type: 'food', amount: cost.food, reason: '槽位开通' },
        ]);
        console.log(message);
      }
    }
  } else if (!slot.building) {
    showBuildingMenu(index, type);
  } else {
    // 点击已建造的建筑
    if (type === 'special') {
      openSpecialManager(index); // [新增] 打开管理菜单
    } else if (type === 'breeding') {
      // 繁殖间保留原有逻辑（如无特殊操作可留空）
    } else if (type === 'resource' && slot.building.id === 'sacrifice_altar') {
      openSacrificeDialog(index);
    } else {
      // 普通资源建筑点击逻辑（此处保持原有的拆除逻辑作为示例）
      const confirmed = confirm(`是否拆除 ${slot.building.name}?`);
      if (confirmed) removeBuilding(index, type);
    }
  }
};

const canUnlockSlot = (index: number, type: SlotType) => {
  if (type === 'global') return false;
  let slots = type === 'breeding' ? breedingSlots.value : 
              type === 'resource' ? resourceSlots.value : specialSlots.value;
  
  if (index < 2) return true;
  for (let i = 2; i < index; i++) {
    if (!slots[i].unlocked) return false;
  }
  return true;
};

const isNextUnlockSlot = (index: number, type: SlotType) => {
  if (type === 'global') return false;
  let slots = type === 'breeding' ? breedingSlots.value : 
              type === 'resource' ? resourceSlots.value : specialSlots.value;
  
  if (slots[index].unlocked) return false;
  for (let i = 2; i < slots.length; i++) {
    if (!slots[i].unlocked) return i === index;
  }
  return false;
};

// ==================== 建筑菜单管理 ====================

const showBuildingMenu = (slotIndex: number, type: SlotType) => {
  selectedSlotIndex.value = slotIndex;
  selectedSlotType.value = type;
  showMenu.value = true;
};

const closeMenu = () => {
  showMenu.value = false;
  selectedSlotIndex.value = -1;
};

// ==================== 建筑建设管理 ====================

const canBuild = (building: Building) => {
  if (building.id === 'sacrifice_altar') {
    const existingAltarCount = resourceSlots.value.filter(slot => slot.building?.id === 'sacrifice_altar').length;
    if (existingAltarCount >= 1) return false;
    return canAffordBuilding(building.cost);
  }

  if (building.id === 'breeding') {
    const existingBreedingCount = breedingSlots.value.filter(slot => slot.building?.id === 'breeding').length;
    const dynamicCost = {
      gold: building.cost.gold + existingBreedingCount * 25,
      food: building.cost.food + existingBreedingCount * 15,
    };
    return canAffordBuilding(dynamicCost);
  } else {
    return canAffordBuilding(building.cost);
  }
};

const selectBuilding = (building: Building) => {
  if (!canBuild(building)) return;

  if (selectedSlotIndex.value >= 0) {
    let actualCost = building.cost;
    if (building.id === 'breeding') {
      const existingBreedingCount = breedingSlots.value.filter(slot => slot.building?.id === 'breeding').length;
      actualCost = {
        gold: building.cost.gold + existingBreedingCount * 25,
        food: building.cost.food + existingBreedingCount * 15,
      };
    }

    if (payForBuilding(actualCost, building.name)) {
      if (selectedSlotType.value === 'global') return;

      // [修改] 支持 special 类型
      const slots = selectedSlotType.value === 'breeding' ? breedingSlots.value : 
                    selectedSlotType.value === 'resource' ? resourceSlots.value : specialSlots.value;
      
      slots[selectedSlotIndex.value].building = building;
      saveBuildingData();
      closeMenu();
    }
  }
};

const removeBuilding = async (slotIndex: number, type: SlotType) => {
  // [修改] 支持 special 类型
  const slots = type === 'breeding' ? breedingSlots.value : 
                type === 'resource' ? resourceSlots.value : specialSlots.value;
  const building = slots[slotIndex]?.building;
  if (!building) return;

  const confirmed = await ConfirmService.showWarning(
    `确定要拆除 ${building.name} 吗？`,
    '确认拆除',
    `拆除后将失去该建筑的所有效果。`,
  );

  if (confirmed) {
    // [新增] 如果是特殊建筑且有人，先移除人
    if (type === 'special') {
      const slot = slots[slotIndex];
      if (slot.assignedCharacterId) {
        const worker = characters.value.find(c => c.id === slot.assignedCharacterId);
        if (worker) {
          worker.locationId = null; // 清除位置
        }
        slot.assignedCharacterId = null;
      }
    }

    slots[slotIndex].building = null;
    saveBuildingData();
  }
};

// ==================== 全局建筑点建式管理 ====================
const checkGlobalBuildingUnlock = (building: Building) => {
  if (!building.unlockCondition) return true;
  const condition = building.unlockCondition;
  if (condition.isUnlocked !== undefined) return condition.isUnlocked;
  if (condition.requiredBuildings && condition.requiredBuildings.length > 0) {
    for (const requiredId of condition.requiredBuildings) {
      const count = builtGlobalBuildings.value[requiredId] || 0;
      if (count === 0) return false;
    }
  }
  return true;
};

const canBuildGlobalBuilding = (building: Building) => {
  if (!checkGlobalBuildingUnlock(building)) return false;
  const currentCount = builtGlobalBuildings.value[building.id] || 0;
  if (currentCount >= 1) return false;
  return canAffordBuilding(building.cost);
};

const handleBuildGlobalBuilding = (building: Building) => {
  if (!canBuildGlobalBuilding(building)) return;
  if (payForBuilding(building.cost, building.name)) {
    builtGlobalBuildings.value[building.id] = 1;
    saveBuildingData();
  }
};

const handleRemoveGlobalBuilding = async (building: Building) => {
  const currentCount = builtGlobalBuildings.value[building.id] || 0;
  if (currentCount === 0) return;
  const confirmed = await ConfirmService.showWarning(`确定拆除 ${building.name}?`, '确认', '无法恢复');
  if (confirmed) {
    builtGlobalBuildings.value[building.id] = currentCount - 1;
    if (builtGlobalBuildings.value[building.id] === 0) delete builtGlobalBuildings.value[building.id];
    saveBuildingData();
  }
};

const handleGlobalBuildingInteract = (building: Building) => { 
  if (building.id === 'audience_hall') showAudienceHall.value = true;
};

// ==================== [新增] 特殊建筑管理逻辑 ====================

const openSpecialManager = (index: number) => {
  selectedSlotIndex.value = index;
  selectedSlotType.value = 'special';
  const slot = specialSlots.value[index];
  
  // 获取当前工作人员
  if (slot.assignedCharacterId) {
    selectedSpecialWorker.value = characters.value.find(c => c.id === slot.assignedCharacterId);
  } else {
    selectedSpecialWorker.value = null;
  }
  
  showSpecialManager.value = true;
};

const closeSpecialManager = () => {
  showSpecialManager.value = false;
  selectedSpecialWorker.value = null;
};

const openCharacterSelector = () => {
  showCharacterSelector.value = true;
};

const closeCharacterSelector = () => {
  showCharacterSelector.value = false;
};

const selectWorker = (character: any) => {
  const slot = specialSlots.value[selectedSlotIndex.value];
  
  // 更新槽位数据
  slot.assignedCharacterId = character.id;
  
  // 更新人物数据
  character.locationId = `special-${selectedSlotIndex.value}`;
  
  // 更新选中状态
  selectedSpecialWorker.value = character;
  
  closeCharacterSelector();
  saveBuildingData(); // 保存更改
  
  // 同步到 training 模块
  syncSpecialRoomInfo();
};

const removeWorker = () => {
  const slot = specialSlots.value[selectedSlotIndex.value];
  if (slot.assignedCharacterId) {
    const worker = characters.value.find(c => c.id === slot.assignedCharacterId);
    if (worker) {
      worker.locationId = null;
    }
    slot.assignedCharacterId = null;
    selectedSpecialWorker.value = null;
    saveBuildingData();
    syncSpecialRoomInfo();
  }
};

const demolishSpecialBuilding = () => {
  closeSpecialManager();
  removeBuilding(selectedSlotIndex.value, 'special');
};

// 进入互动
const enterBuildingInteraction = () => {
  if (!selectedSpecialWorker.value) return;
  showSpecialManager.value = false; // 关闭管理菜单
  showInteraction.value = true; // 打开互动界面
};

const closeInteraction = () => {
  showInteraction.value = false;
};

const handleInteractionUpdate = (updatedCharacter: any) => {
  // 更新本地人物列表
  const index = characters.value.findIndex(c => c.id === updatedCharacter.id);
  if (index > -1) {
    characters.value[index] = updatedCharacter;
  }
  selectedSpecialWorker.value = updatedCharacter;
  // 保存到存档
  saveBuildingData();
};

const getStatusText = (status: string) => {
  const map: any = { imprisoned: '关押', surrendered: '堕落', training: '调教', working: '工作' };
  return map[status] || status;
};

const getSpecialRoomOccupant = (index: number) => {
  const slot = specialSlots.value[index];
  if (slot && slot.assignedCharacterId) {
    const char = characters.value.find(c => c.id === slot.assignedCharacterId);
    if (char) return { name: char.name, avatar: char.avatar };
  }
  return null;
};

const getBreedingRoomOccupant = (index: number) => {
  const roomId = `breeding-${index}`;
  const char = characters.value.find(c => c.locationId === roomId);
  if (char) return { id: char.id, name: char.name, status: char.status };
  return null;
};

// ==================== 数据持久化 ====================

const saveBuildingData = (): void => {
  try {
    const currentTotalIncome = totalIncome.value;
    const nestData: NestModuleData = {
      breedingSlots: breedingSlots.value,
      resourceSlots: resourceSlots.value,
      specialSlots: specialSlots.value, // [新增] 保存特殊槽位
      globalSlots: [],
      builtGlobalBuildings: builtGlobalBuildings.value,
      activeTab: activeTab.value,
      totalIncome: currentTotalIncome,
      breedingRoomInfo: [], // 繁殖间信息同步处理
    };

    modularSaveManager.updateModuleData({
      moduleName: 'nest',
      data: nestData,
    });
    
    // 同步特殊建筑人员信息到 training 模块
    syncSpecialRoomInfo();
  } catch (error) {
    console.error('保存巢穴数据失败:', error);
  }
};

const syncSpecialRoomInfo = () => {
  try {
    const trainingData = modularSaveManager.getModuleData({ moduleName: 'training' }) as any;
    if (trainingData && trainingData.characters) {
      // 更新 trainingData 中的 characters 位置信息
      const updatedChars = trainingData.characters.map((savedChar: any) => {
        const sessionChar = characters.value.find(c => c.id === savedChar.id);
        if (sessionChar) {
          return { ...savedChar, locationId: sessionChar.locationId };
        }
        return savedChar;
      });
      
      modularSaveManager.updateModuleData({
        moduleName: 'training',
        data: { ...trainingData, characters: updatedChars }
      });
    }
  } catch (e) {
    console.error('同步特殊建筑人员失败', e);
  }
};

const loadBuildingData = (): void => {
  try {
    const currentGameData = modularSaveManager.getCurrentGameData();
    if (currentGameData && currentGameData.nest) {
      const nestData = currentGameData.nest;
      breedingSlots.value = nestData.breedingSlots || [];
      resourceSlots.value = nestData.resourceSlots || [];
      specialSlots.value = nestData.specialSlots || [ // [新增] 兼容旧存档
        { building: null, unlocked: true },
        { building: null, unlocked: false }
      ];
      
      if (nestData.builtGlobalBuildings) builtGlobalBuildings.value = nestData.builtGlobalBuildings;
      else builtGlobalBuildings.value = {};
      
      if (!builtGlobalBuildings.value['audience_hall']) builtGlobalBuildings.value['audience_hall'] = 1;

      activeTab.value = nestData.activeTab || 'breeding';
    } else {
      initializeSlots();
    }
  } catch (error) {
    console.error('加载巢穴数据失败:', error);
    initializeSlots();
  }
};

// ==================== 生命周期 ====================

watch([breedingSlots, resourceSlots, specialSlots, activeTab], () => {
  setTimeout(() => saveBuildingData(), 100);
}, { deep: true });

onMounted(() => {
  initializeSlots();
  loadBuildingData();
  loadCharacters();
});

onActivated(() => {
  loadBuildingData();
  loadCharacters();
  // 恢复 assignedCharacterId 对应的引用
  specialSlots.value.forEach((slot, idx) => {
    if (slot.assignedCharacterId) {
      const char = characters.value.find(c => c.id === slot.assignedCharacterId);
      if (char) char.locationId = `special-${idx}`;
    }
  });
});

const loadCharacters = () => {
  try {
    const trainingData = modularSaveManager.getModuleData({ moduleName: 'training' }) as any;
    if (trainingData && trainingData.characters) {
      characters.value = trainingData.characters;
    }
  } catch (error) {
    console.error('加载人物数据失败:', error);
  }
};

// ==================== 献祭相关方法 ====================

const openSacrificeDialog = (slotIndex: number) => {
  currentSacrificeSlotIndex.value = slotIndex;
  showSacrificeDialog.value = true;
};

const closeSacrificeDialog = () => {
  showSacrificeDialog.value = false;
  currentSacrificeSlotIndex.value = -1;
};

const handleSacrificeConfirm = async (characterId: string, sacrificeAmounts: SacrificeAmounts) => {
  const totalAmount = sacrificeAmounts.normalGoblins + sacrificeAmounts.warriorGoblins +
    sacrificeAmounts.shamanGoblins + sacrificeAmounts.paladinGoblins;
  
  const confirmed = await ConfirmService.showWarning(
    `确定要献祭 ${totalAmount} 个哥布林吗？`,
    '确认献祭',
    '将消耗哥布林提升人物等级'
  );

  if (!confirmed) return;

  const result = SacrificeService.performSacrifice(characterId, sacrificeAmounts);
  if (result.success) {
    PlayerLevelService.updatePlayerLevel();
    closeSacrificeDialog();
  }
};
</script>

<style lang="scss" scoped>
// ==================== 基础容器样式 ====================

.nest-container {
  height: calc(100vh - 90px);
  width: 100%;
  max-width: 100%;
  padding: 16px;
  background: linear-gradient(180deg, rgba(40, 26, 20, 0.6), rgba(25, 17, 14, 0.85));
  border: 1px solid rgba(205, 133, 63, 0.25);
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 200, 150, 0.08),
    0 8px 18px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
}

.building-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// ==================== [新增] 弹窗样式 ====================
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: #2a1f1b;
  border: 1px solid #cd853f;
  border-radius: 8px;
  width: 400px;
  max-width: 90%;
  color: #ffd7a1;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    padding: 10px 15px;
    border-bottom: 1px solid rgba(205,133,63,0.3);
    h3 { margin: 0; }
    .close-btn { background: none; border: none; color: inherit; font-size: 20px; cursor: pointer; }
  }
  
  .modal-body {
    padding: 15px;
  }
}

.special-manager-body {
  display: flex;
  flex-direction: column;
  gap: 15px;
  
  .building-info {
    text-align: center;
    .icon { font-size: 40px; margin-bottom: 5px; }
    p { margin: 0; font-size: 14px; opacity: 0.8; }
  }
  
  .worker-section {
    border: 1px dashed #cd853f;
    padding: 10px;
    border-radius: 6px;
    
    h4 { margin: 0 0 10px 0; font-size: 14px; }
    
    .empty-worker {
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.2);
      cursor: pointer;
      &:hover { background: rgba(0,0,0,0.3); }
    }
    
    .worker-card {
      display: flex;
      align-items: center;
      gap: 10px;
      .worker-avatar {
        width: 50px; height: 50px; border-radius: 50%; overflow: hidden; background: #000;
        img { width: 100%; height: 100%; object-fit: cover; }
        span { font-size: 30px; display: block; text-align: center; line-height: 50px; }
      }
      .worker-info {
        flex: 1;
        .name { font-weight: bold; }
        .status { font-size: 12px; opacity: 0.7; }
      }
      .remove-btn {
        background: #8a3c2c; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;
      }
    }
  }
  
  .actions-section {
    display: flex;
    gap: 10px;
    .action-btn {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      &.interact { background: #4a90e2; color: white; &:disabled { opacity: 0.5; cursor: not-allowed; } }
      &.danger { background: #d32f2f; color: white; }
    }
  }
}

.selector-content {
  height: 80vh;
  display: flex;
  flex-direction: column;
  
  .character-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    .char-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      background: rgba(0,0,0,0.3);
      border-radius: 6px;
      cursor: pointer;
      &:hover { background: rgba(205,133,63,0.2); }
      
      .char-avatar, .char-icon { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
      .char-icon { background: #000; display: flex; align-items: center; justify-content: center; font-size: 24px; }
      
      .char-details {
        .name { font-weight: bold; }
        .stats { font-size: 12px; opacity: 0.7; }
      }
    }
    
    .no-chars { text-align: center; padding: 20px; opacity: 0.6; }
  }
}
</style>